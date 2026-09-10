# Decisions

> **ADR-lite log — architectural and technical decisions.**
> Append-only. Never rewrite or delete an entry. To supersede a decision, add a new dated entry that references the old one.

---

## How to Use This File

Each entry follows this format:

```
## YYYY-MM-DD — Decision Title

**Context:** Why this decision was needed — what problem or constraint prompted it.

**Decision:** What was decided — the choice made.

**Consequences:** What follows from this decision — impact, trade-offs, things to watch.

**Supersedes:** (optional) Link to a prior decision this replaces.
```

---

<!-- Add new decisions below, newest first. -->

## 2026-09-10 — E2E mocks ADX with a local HTTP server, not main-process patching

**Context:** Spec 0005 requires every implemented feature covered by E2E tests against a mocked ADX. Options: a local HTTP server impersonating the Kusto REST API, or monkey-patching `KustoClientManager` in the main process via `app.evaluate()`.

**Decision:** A local `http.Server` impersonates the Kusto REST API (`POST /v2/rest/query`, `POST /v1/rest/mgmt`), dispatching on the command text against shared fixtures (`tests/e2e/fixtures/kusto-fixtures.js`) and recording every received command for assertions. The app connects to `http://127.0.0.1:<port>` like a real cluster. Harness stays Vitest + `playwright-core` `_electron` (Decision 4 in the spec) — no Playwright test-runner migration.

**Consequences:** The full stack is exercised (SDK deserializer, request paths, IPC, renderer) — the exact layer where 0003 bugfix #3's generator-`rows()` mock-fidelity gap hid. Trade-off: mock responses must be validated against the real `KustoResponseDataSetV1`/`V2` deserializers, and two tiny test-only seams enter production code (see next entry).

## 2026-09-10 — Test-only env-var seams for E2E auth and CSV export

**Context:** The mocked ADX server issues no AAD tokens, so the app's real auth modes (`az` shell-out, device code, app registration) cannot authenticate to it; and the native save dialog cannot be driven by Playwright, blocking E2E coverage of CSV export.

**Decision:** Two env-var-guarded seams, following the established `KUSTODESK_DATA_DIR` pattern: (1) when `KUSTODESK_E2E_TOKEN` is set, `_buildKcsb` uses `withTokenProvider(url, async () => token)` regardless of auth method; (2) when `KUSTODESK_E2E_EXPORT_DIR` is set, the `export:csv` handler skips `dialog.showSaveDialog` and writes to that dir, returning the same `{ success, filePath }` envelope. Both are documented as test-only and unit-tested to be no-ops when unset.

**Consequences:** E2E runs with zero external dependencies (no `az`, no microsoftonline.com). Trade-offs: OAuth round-trips themselves remain untested by E2E (their IPC surface stays covered by integration tests), and production code carries two guarded test-only branches.

## 2026-09-08 - Completion schema comes from one `.show database schema as json` call

**Context:** The 0004 hint engine needs table, materialized-view, and column names per database. Alternatives: one schema-JSON mgmt call, per-resource `.show table <name> cslschema` fetches, or extending `getResources()` to also return columns (spec 0004, Decision 1).

**Decision:** New `KustoClientManager.getSchema()` makes a single `.show database schema as json` mgmt call - parsed by a shared `_fetchDatabaseSchemaNode()` helper also used by the 0003 MV fallback - and is exposed via a dedicated `kusto:get-schema` IPC channel + `adxAPI.getSchema()` preload bridge. `getResources()` is untouched.

**Consequences:** One round-trip; tolerant of clusters that reject per-resource commands (the observed SYN0002 engine serves full schema JSON); column shapes normalized defensively (OrderedColumns string array / object array / object map). Trade-off: the schema JSON is fetched twice on selection (sidebar + editor) - acceptable for v1; folding both behind one channel is a future optimization.

## 2026-09-08 - Custom hint engine on CodeMirror 5 show-hint instead of sql-hint

**Context:** The query editor needs Kusto-aware completion. CodeMirror 5 ships an sql-hint addon, but Kusto is not SQL, and the renderer has no automated DOM test harness (spec 0004, Decision 2).

**Decision:** Load `addon/hint/show-hint.min.js` in index.html (its CSS is already linked) and implement a custom hint function backed by a dependency-free pure module (`src/renderer/kusto-hints.js`, UMD shim so Vitest can require it) holding the curated Kusto keyword/function vocabulary plus pure completion-assembly helpers (identifier scan, ranking, prefix filter with cap).

**Consequences:** Full control over vocabulary, ranking, and triggers; completion logic is unit-testable without the DOM. Trade-off: the keyword/function list is maintained by hand - kept minimal-but-useful for v1.


## 2026-09-03 — MV listing falls back to `.show database schema as json`

**Context:** On the ANOVEDA PROD cluster (`mbdevanoprdeuwkc.westeurope.kusto.windows.net`) every database contains materialized views (e.g. `MicroWeatherView`, `GeoJsonView`), yet `.show materialized views` fails cluster-wide with a parser-level `Syntax error: SYN0002: A recognition error occurred. [1:6]` — the engine does not recognize the command — while `.show database schema as json` returns 200 carrying the full `MaterializedViews` map. The previous graceful degradation therefore always showed an empty MV list. (The earlier "engine without MV support" diagnosis was wrong.)

**Decision:** When `.show materialized views` fails, `getResources` retries via `.show database schema as json` and extracts `Object.keys(Databases[db].MaterializedViews)`. Only if that fallback also fails does it degrade to an empty list, with a `console.warn` naming both errors. Healthy clusters never hit the fallback — no schema call is made.

**Consequences:** MV names now display on clusters that don't recognize the dedicated command. Cost: a heavier schema-JSON fetch (full table/column schema) is made only on clusters where the dedicated command is broken. Supersedes the empty-list-only degradation of the previous decision.

## 2026-09-03 — Tolerate `.show materialized views` failure in `getResources`; surface Kusto error bodies

**Context:** On the ANOVEDA PROD cluster (`mbdevanoprdeuwkc.westeurope.kusto.windows.net`), `.show materialized views` returns 400 `General_BadRequest` for every database (engine without MV support) — and since `getResources` awaited both commands sequentially, the whole resource fetch failed with the unhelpful "Request failed with status code 400". Additionally, axios error messages hide Kusto's actual error description, which is carried in the HTTP response body.

**Decision:** `getResources` fetches `.show tables` and `.show materialized views` independently via `Promise.allSettled`: a `.show tables` failure remains fatal; an MV-command failure degrades to an empty `materializedViews` list with a `console.warn` in the main process. New exported `describeKustoError(err)` extracts the Kusto error body (plain string or `{ error: { "@message" } }` object) and is used by all `kusto:*` IPC error envelopes.

**Consequences:** The resource tree renders with tables even on clusters without MV support (shown as "No materialized views"; the warn is only visible in the main-process log). Error toasts now show the real Kusto reason (e.g. "General_BadRequest: Request is invalid and cannot be executed.") instead of the generic axios message. Supersedes the "a failure in one mgmt call fails the whole refresh" consequence of the combined-channel decision above.

## 2026-09-03 — Resource listing via dedicated mgmt commands (`.show tables` / `.show materialized views`)

**Context:** The resource sidebar needs the names of tables and materialized views of the selected database. Alternatives: two targeted mgmt commands vs. one `.show database [name] schema` call (heavy payload, complex parsing — but includes columns/types useful for IntelliSense later).

**Decision:** `KustoClientManager.getResources()` issues two database-scoped mgmt commands — `.show tables` (map `TableName`) and `.show materialized views` (map `Name`) — reusing the per-cluster client cache and the `getDatabases()` pattern. An empty database short-circuits before any client creation or mgmt call.

**Consequences:** Simple, small payloads, stable output columns; two mgmt calls per refresh instead of one. Column/schema data (needed for 0004 IntelliSense) can be layered on later via the schema command.

## 2026-09-03 — One combined `kusto:get-resources` IPC channel instead of two

**Context:** The tree always renders both tables and materialized views together; the question was one combined channel vs. separate `kusto:get-tables` / `kusto:get-materialized-views`.

**Decision:** Single `kusto:get-resources` channel returning `{ success, resources: { tables, materializedViews } }` with the standard success/error envelope and device-code relay; preload exposes `adxAPI.getResources(params)`.

**Consequences:** One round trip, atomic tree refresh, fewer channels to register/test. A failure in either mgmt call fails the whole refresh — acceptable since the refresh button retries.

## 2026-09-03 — Custom DOM context menu for the resource tree

**Context:** Right-clicking a resource should offer "Query 100 rows". Candidates: Electron native `Menu.popup()` vs. a custom DOM menu.

**Decision:** Custom DOM context menu in the renderer — fixed position, viewport-clamped, dismissed on click-away/Escape/blur — styled with the existing dark-theme tokens.

**Consequences:** Consistent dark UI with no main-process coupling or IPC round trip per invocation. Manual positioning/dismissal logic lives in `app.js` (renderer is not covered by automated tests, per 0002 convention).

## 2026-09-03 — "Query 100 rows" inserts an always bracket-quoted `["Name"] | take 100` at the cursor

**Context:** The starter query must be safe for resource names containing spaces, special characters, or reserved words.

**Decision:** Always insert `["ResourceName"] | take 100` via CodeMirror `replaceSelection` at the cursor (insertion only, never auto-run); embedded `\` and `"` are escaped defensively.

**Consequences:** Correctness over aesthetics — slightly noisier query for simple names, but consistent output that is easy to test.

## 2026-09-02 — Re-sign Electron dev binary ad-hoc to fix revoked-notarization Gatekeeper block

**Context:** After `npm install`, macOS flagged the freshly downloaded `node_modules/electron/dist/Electron.app` as "dangerous / will damage your computer" and blocked (then deleted) the app on launch. System log showed `Notarization daemon found revoked hash` — Apple revoked the notarization hash of some Electron 31 builds. Removing the `com.apple.quarantine` attribute did NOT help because revocation is checked online regardless of quarantine.

**Decision:** Strip the revoked Apple signature by re-signing the bundle ad-hoc (`codesign --force --deep --sign -`) via a `postinstall` script (`scripts/fix-electron-macos-signature.js`) that no-ops on non-macOS. Locally spawned ad-hoc apps skip the notarization check entirely.

**Consequences:** Dev runs and the Playwright E2E smoke test launch cleanly. A fresh `npm ci`/`npm install` is self-healing. If Apple's revocation list changes the packaged/release app behavior, packaging may need an equivalent treatment (related known issue: "MacOS recognizes the app as not trusted software").

## 2026-09-02 — Separate "Build & Test" CI workflow in `build.yml`

**Context:** The only workflow was `release.yml` ("Build & Test"), tag-triggered; packaging breakage was only caught at release time.

**Decision:** New `.github/workflows/build.yml` ("Build & Test"): triggers on push to `main` and PRs; `test` job (ubuntu: `npm test` + `xvfb-run npm run test:e2e`) plus a 3-OS build matrix mirroring `release.yml`. Artifacts are debugging aids only; no release publishing. File named `build.yml` per owner preference.

**Consequences:** Fast pre-release feedback; release workflow untouched. E2E in CI only runs on Linux (xvfb) — macOS Gatekeeper quirks don't affect CI.

## 2026-09-02 — Testability refactors: injectable Store, extracted `csv.js` and `ipc-handlers.js`

**Context:** All IPC handlers and CSV serialization lived inline in `main.js`, tightly coupled to Electron — untestable without launching the app. `Store` hard-coded `app.getPath('userData')`.

**Decision:** `Store` accepts optional `dataDir` (falls back to `app.getPath('userData')`); CSV serialization extracted to pure `src/main/csv.js` (`toCsv`); all IPC handlers moved to `src/main/ipc-handlers.js` as `registerIpcHandlers({ ipcMain, store, kustoManager, dialog, getWindow })` with every Electron touchpoint injected. `main.js` is now a thin composition root (PATH fix, lifecycle, window, one registration call). New `KUSTODESK_DATA_DIR` env var overrides `userData` so E2E runs never touch real app data.

**Consequences:** Unit/integration tests run in plain Node with zero Electron mocks. Behavior is unchanged (CSV null/undefined cells remain *unquoted* empty cells — now pinned by tests). `main.js` no longer needs `dialog`/`shell` imports.

## 2026-09-02 — Vitest as the test runner

**Context:** Needed a runner for a CommonJS Electron codebase with heavy module mocking (azure-kusto-data, child_process/`az` shell-out), working on Node 20 (CI) and 24 (local).

**Decision:** Vitest 3 with `tests/{unit,integration,e2e}` layout; scripts `test`, `test:unit`, `test:integration`, `test:e2e`, `test:watch`. E2E is a separate script since it needs a display.

**Consequences:** Fast (49 tests ≈ 0.4s) and zero-config. Gotcha discovered: `vi.mock` does NOT intercept `require()` calls made inside CJS source modules (the `az` shell-out really ran, and real MSAL requests went out) — `kusto-client` tests therefore patch the real `azure-kusto-data`/`child_process` exports via `createRequire` before importing the module instead of using `vi.mock`.


## 2026-05-18 — Azure CLI auth via direct shell-out, not `@azure/identity`

**Context:** The app must authenticate to ADX exactly the way the user's terminal does. The original plan (`implementation_plan.md`) assumed `@azure/identity` `AzureCliCredential` via `KustoConnectionStringBuilder.withAzLoginIdentity()`, but it misbehaves inside Electron — wrong resource scope, PATH resolution issues, and tenant resolution problems (documented in `kusto-client.js` comments).

**Decision:** Shell out to `az account get-access-token --resource https://kusto.kusto.windows.net` directly, wrapped in `KustoConnectionStringBuilder.withTokenProvider()` (per-request callback handles token refresh). Optional `--tenant` scoping for guest users in multiple tenants.

**Consequences:** Auth behaves identically to the terminal — the core promise of the app. Requires `az` on PATH; Electron launched from Finder/Dock doesn't inherit the shell PATH, so common Homebrew locations are prepended to `PATH` at startup in `main.js`. Spawns a child process per token acquisition.

**Supersedes:** The `AzureCliCredential` assumption in `implementation_plan.md` (v1 spec `0001`, Decision 1).

## 2026-05-18 — Plain JSON file storage instead of `electron-store`

**Context:** Need durable persistence for cluster configurations and query history. `implementation_plan.md` proposed `electron-store`.

**Decision:** Plain JSON files (`clusters.json`, `history.json`) read/written with `fs` inside Electron's `userData` path, via a ~100-line `Store` class (`src/main/store.js`).

**Consequences:** Zero storage dependencies, human-inspectable files, history capped at 200 entries, cluster delete cascades to history. No schema validation. Client secrets are stored in plain text in `clusters.json` — known debt; encryption via Electron `safeStorage` is a future candidate.

## 2026-05-18 — CodeMirror 5 via CDN for the query editor

**Context:** The query editor needed syntax highlighting, line numbers, and comment toggling. Candidates: Monaco Editor, CodeMirror 5, CodeMirror 6.

**Decision:** CodeMirror 5 loaded from cdnjs via `<script>` tags in `index.html` — SQL mode, matchbrackets, comment, and placeholder addons; no bundler or build step.

**Consequences:** Lightweight and simple to integrate in a no-bundler Electron app. CDN dependency means network access is needed on first run; no Kusto-specific IntelliSense (SQL highlighting is close enough for v1).

## 2026-05-18 — Cache Kusto clients per cluster/auth, except device-code

**Context:** Query sessions hit the same cluster repeatedly; recreating the client per request adds re-authentication overhead.

**Decision:** Cache `Client` instances keyed by `url::authMethod(:tenantId:clientId)` in `KustoClientManager`. Device-code clients are never cached (the interactive flow must not be reused across attempts). `invalidate()` is called when a cluster is deleted (or its credentials change).

**Consequences:** Faster repeated queries. A small staleness window exists for revoked credentials, bounded by cluster edit/delete which invalidates the cache.