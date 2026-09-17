# Tasks

> **Kanban-style task board.** Only ONE task "In Progress" at a time.
> Move items between sections as work progresses. Don't delete — move to Done.

---

## In Progress

<!-- The single task currently being worked on. Only ONE at a time. -->

- **0005 — Task 4: Wiring: launch helper + smoke extension** — `tests/e2e/helpers/launch-app.js` (mock server + isolated data dir + `KUSTODESK_E2E_TOKEN` + cleanup, `it.skipIf(noDisplay)` pattern); extend `smoke.test.js` to also boot the app against the mock — proves the full wiring before any scenario exists. Not started — queued as the next session's first action.

## Todo

<!-- Upcoming tasks, ordered by priority. -->

- **0005 — E2E tests with mocked ADX** (spec: `.ai/specs/0005_e2e-tests.md`, APPROVED) — ordered so each task is independently committable:
  1. [x] **Prep: SDK REST contract verification + mock-server core** — DONE: contract pinned from `node_modules/azure-kusto-data` v6.0.3 source; `tests/e2e/helpers/mock-kusto-server.js` + 10 fidelity unit tests (also caught + fixed a real `columnType`→`type` deserializer bug in `execute()`)
  2. [x] **Prep: app test seams** — DONE: `KUSTODESK_E2E_TOKEN` static-token provider at the top of `_buildKcsb` + `KUSTODESK_E2E_EXPORT_DIR` in the `export:csv` handler; 5 new tests prove set/unset behavior for both (all three real auth modes untouched when unset)
  3. [x] **Fixtures: single source of truth** — DONE: `tests/e2e/fixtures/kusto-fixtures.js` (cluster factory, TestDB/AuxDB, StormEvents + StormEventsByState schema, take/context-menu/failing queries, `.show databases`/`.show tables`/`.show materialized views`/schema-JSON rows, error payloads, `defaultDataset({ materializedViewsError })`); mock server's default dataset wired to the fixtures; 6 new default-dataset fidelity tests through the real SDK (118 unit+integration green)
  4. [ ] **Wiring: launch helper + smoke extension** — `tests/e2e/helpers/launch-app.js` (mock server + isolated data dir + `KUSTODESK_E2E_TOKEN` + cleanup, `it.skipIf(noDisplay)` pattern); extend `smoke.test.js` to also boot the app against the mock — proves the full wiring before any scenario exists
  5. [ ] **Scenarios: cluster lifecycle** — add/edit/delete cluster + `clusters.json` persistence + history cascade, test-connection success/failure, database dropdown from mock (spec scenarios 1–3)
  6. [ ] **Scenarios: query execution** — results table (row count, cells), sorting, JSON tab, history entry + reload on click, error surfacing + recovery (spec scenarios 5–6)
  7. [ ] **Scenarios: resources + IntelliSense** — sidebar tables/MVs from mock, right-click `["Name"] | take 100` insert, completions from mocked schema incl. `Table.` columns (spec scenarios 4, 7)
  8. [ ] **Scenarios: CSV export** — export writes a file whose contents equal `toCsv(columns, rows)` for the fixture rows (spec scenario 8)
  9. [ ] **Wrap-up** — headless verification (`xvfb-run -a npm run test:e2e` locally, same as CI), README testing section (mocked E2E + local preview), spec → DONE, `/save-progress`

  (After 0005, feature candidates remain: fold `getResources` + `getSchema` behind one IPC channel; packaged-macOS Gatekeeper treatment; Azure support ticket for the ANOVEDA PROD SYN0002 anomaly)

## Done

<!-- Completed tasks. Keep a running history. -->

- **0005 — Task 3: Fixtures: single source of truth** (spec: `.ai/specs/0005_e2e-tests.md`) — new `tests/e2e/fixtures/kusto-fixtures.js`: `clusterDefinition(url)` factory (name/auth cli — proves the `KUSTODESK_E2E_TOKEN` seam overrides a real mode in the full app), `DATABASE`/`DATABASES` (TestDB, AuxDB), `StormEvents` table + `StormEventsByState` MV with columns, query fixtures (take-query, context-menu `["StormEvents"] | take 100`, failing SEM0100 query), mgmt rows for `.show databases`/`.show tables`/`.show materialized views`/schema-JSON, error payloads, `databaseSchemaNode()/Json()` helpers, and `defaultDataset({ materializedViewsError })`. `MockKustoServer`'s default dataset now wired to the fixtures. 6 new unit tests pin the default dataset through the real deserializers + real SDK `Client` over HTTP (types, nulls, error text, SYN0002 variant with schema fallback). 118 unit+integration + E2E smoke green.

- **0005 — Task 2: Prep: app test seams** (spec: `.ai/specs/0005_e2e-tests.md`) — `KUSTODESK_E2E_TOKEN` seam at the top of `_buildKcsb` (`src/main/kusto-client.js`): when set, builds `withTokenProvider(url, async () => token)` regardless of the configured auth method; when unset, all three real auth modes are untouched. `KUSTODESK_E2E_EXPORT_DIR` seam in the `export:csv` handler (`src/main/ipc-handlers.js`): when set, skips `dialog.showSaveDialog` and writes `adx-results-<ts>-<rand>.csv` into the dir, returning the same `{ success, filePath }` envelope; when unset, the dialog flow is unchanged. 5 new tests (3 unit for the token seam incl. a "az must never run in E2E" regression guard, 2 integration for the export seam incl. dialog-bypass and unchanged-dialog-flow) — 112 unit+integration tests green.

- **0005 — Task 1: Prep: SDK REST contract verification + mock-server core** (spec: `.ai/specs/0005_e2e-tests.md`) — REST contract pinned from `node_modules/azure-kusto-data` v6.0.3 source (POST `/v2/rest/query` + `/v1/rest/mgmt` with `{db, csl}` bodies; GET `/v1/rest/auth/metadata` before every execute; loopback unconditionally trusted; 200-only success; V2 frames / V1 `Tables` envelopes); new `tests/e2e/helpers/mock-kusto-server.js` (ephemeral loopback port, dispatch on literal command text, function entries, Kusto-style error bodies, received-command recorder, bearer-ignored); `tests/unit/mock-kusto-server.test.js` with 10 tests pinning fidelity against the real `KustoResponseDataSetV1`/`V2` deserializers AND the real SDK `Client` over actual HTTP. Contract verification caught a real bug: `execute()` read `c.columnType` but the SDK's `KustoResultColumn` exposes `type` — every column type degraded to `'dynamic'`; fixed in `kusto-client.js` + mock fixtures updated. 107 unit+integration + E2E smoke green.

- **0004 — Kusto IntelliSense** (spec: `.ai/specs/0004_kusto-intellisense.md`) — `getSchema()` (single `.show database schema as json` call, defensive column normalizer, empty-db short-circuit) + `kusto:get-schema` IPC + `adxAPI.getSchema()` preload (14d3aa3); pure hint engine `src/renderer/kusto-hints.js` (UMD shim; curated vocabulary, prefixMatch, collectIdentifiers, buildCompletions) + unit tests (2347cd9); editor integration (show-hint.min.js, schema cache keyed `url::database` + stale guard, custom kustoHint with dot-completion, Ctrl/⌘+Space + auto-popup, comment/string suppression, dark popup theme, README bullet — c84d35f). Manual verification surfaced two bugs, fixed during verification: missing script tag (8a5c780 + E2E regression guard) and cross-resource column suggestions → SEM0100 (a96b78a: case-insensitive `findResource()` + referenced-resource-only column scoping). 97 unit+integration + E2E green; all 6 spec scenarios + spot-checks verified.

- **0003 — Resource listing** (spec: `.ai/specs/0003_resource-listing.md`) — `KustoClientManager.getResources()` (`.show tables` / `.show materialized views` via `executeMgmt`, client-cache reuse, empty-db short-circuit); `kusto:get-resources` IPC channel + `adxAPI.getResources()` preload bridge; "Resources" sidebar section with collapsible Tables / Materialized Views groups, loading/error/empty states, stale-response guard, refresh button; right-click context menu inserting `["Name"] | take 100` at the cursor. 8 new tests (5 unit, 3 integration) — 57 total green.

- **0002 — Automated test suite** (spec: `.ai/specs/0002_test-suite.md`) — Vitest runner; 49 unit+integration tests (store CRUD/cap/cascade, kusto-client auth modes + cache keying + v6 result mapping, CSV quoting, full IPC surface); Playwright E2E smoke with `KUSTODESK_DATA_DIR` isolation; testability refactors (`Store(dataDir)`, `src/main/csv.js`, `src/main/ipc-handlers.js`); `.github/workflows/build.yml` ("Build & Test"); postinstall Electron ad-hoc re-sign fixing revoked-notarization Gatekeeper block.

- **0001 — Initial version** (spec: `.ai/specs/0001_initial-version.md`) — full Electron ADX desktop client: multi-cluster CRUD, 3 auth modes (Azure CLI shell-out / Device Code / App Registration), CodeMirror query editor, sortable results table + JSON view, CSV export, per-cluster history, dark UI, mac/win/linux packaging. Verified manually; automated testing deferred to 0002. Key decisions logged in `decisions.md`.
