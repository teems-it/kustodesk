# Progress Log

> **Chronological session log — append a dated entry after each `/save-progress`.**
> Each entry references commit SHAs and summarizes what was accomplished.
> This file is history — append-only, never rewrite past entries.

---

<!-- Add new session entries below, newest first. -->

## 2026-09-10 — Session Summary

**Commits:** `8a5c780`, `8de54a0`, `a96b78a`, `738e8c5` (baseline `103e681`)

**What was done:**
- `8a5c780` — **bugfix (manual verification round 1):** scenarios 1-3 showed no popup at all — the `kusto-hints.js` script tag was missing from index.html, so `window.KustoHints` was undefined and `kustoHint()` threw on every invocation (Ctrl/⌘+Space and auto-popup). Script tag added before app.js; E2E smoke extended with an in-renderer regression guard asserting `KustoHints.buildCompletions` and `CodeMirror.showHint` exist in the loaded renderer
- `a96b78a` — **bugfix (manual verification round 2):** scenario 3 suggested columns that don't exist on the queried table (MV-only column suggested for a table query → Kusto SEM0100). Two root causes fixed in `buildCompletions`: exact-match resource lookups (Kusto identifiers are case-insensitive — new case-insensitive `findResource()` helper) and the general path always appending all-DB columns (now: referenced-resource-only columns when references resolve; all-DB fallback only on fresh queries, scenario 4 preserved). Unit tests updated/added — 97 total green
- `738e8c5` + `8de54a0` — PCS syncs after each bugfix
- Spec 0004 → **DONE**: all 6 spec scenarios + spot-checks (comment/string suppression, Escape/click-away, refresh refetch) verified manually with `npm start` against a real cluster; scenario 6 verified by unit test + console-warn fallback; DoD fully checked off; tasks.md 0004 → Done

**Status after session:**
- 0004 Kusto IntelliSense DONE. 97 unit+integration tests + 1 E2E smoke all green; working tree clean; `main` pushed to origin (CI green on `738e8c5`).

**Next:**
- Pick the next feature and write its spec as DRAFT. Candidates: fold `getResources` + `getSchema` behind one IPC channel (double schema-JSON fetch trade-off from 0004 Decision 1); stored-function/external-table completion; packaged-macOS Gatekeeper treatment; Azure support ticket for the ANOVEDA PROD SYN0002 anomaly.

## 2026-09-03 — Session Summary

**Commits:** `94042db`, `3390991`, `1224095`, `a14b003`, `9f2e9e5`, `25f7348`, `ad8826b`, `72f97ab`, `f9b63f6`, `66c589c`

**What was done:**
- `94042db` — 0003 spec written (DRAFT → committed); IntelliSense renumbered to 0004
- `3390991` — lockfile `hasInstallScript` flag from the postinstall hook
- `1224095` — **0003 Resource listing feature**: `KustoClientManager.getResources()` (`.show tables` / `.show materialized views` via `executeMgmt`, client-cache reuse, empty-db short-circuit); `kusto:get-resources` IPC + `adxAPI.getResources()` preload; Resources sidebar with collapsible Tables / Materialized Views groups, loading/error/empty states, stale-response guard, refresh button; right-click context menu inserting `["Name"] | take 100` at the cursor; 8 new tests (57 total), README, spec → DONE, 4 decisions
- `9f2e9e5` — **bugfix #1**: clusters rejecting `.show materialized views` (400) no longer fail the whole fetch — `Promise.allSettled` with MV-degradation; new `describeKustoError()` surfaces Kusto error bodies in all `kusto:*` envelopes (63 tests)
- `ad8826b` — **bugfix #2**: MV listing falls back to `.show database schema as json` (`Databases[db].MaterializedViews`) because the ANOVEDA PROD cluster rejects the dedicated command with a parser-level SYN0002 error although MVs exist in every database (64 tests)
- `f9b63f6` — **bugfix #3**: schema fallback indexed `rows()[0]`, which is `undefined` on the real SDK generator (`*rows()`) — now iterated with `for..of`; generator-based mocks + regression test driving the real `KustoResponseDataSetV1` deserializer; verified end-to-end offline against the real cluster payload (`["MaterializedView"]`) — (65 tests)
- PCS commits (`a14b003`, `25f7348`, `72f97ab`, `66c589c`) keep context/spec/decisions/progress-log in sync

**Status after session:**
- 0003 DONE including all three reported bugs fixed. 65 unit+integration tests + 1 E2E smoke all green; working tree clean; 12 commits ahead of `origin/main`, not yet pushed.

**Next:**
- Manual check in the app that MVs render and right-click works, push to `main` to run Build & Test CI, then start 0004 — Kusto IntelliSense (create `.ai/specs/0004_kusto-intellisense.md`); consider an Azure support ticket for the cluster's SYN0002 anomaly.

## 2026-09-03 — 0003 bugfix #3: generator rows() indexing bug in the schema fallback (commit `f9b63f6`)

**Task:** 0003 follow-up — "still only tables, MV count always 0" after bugfix #2 — **FIXED**

**Diagnosis (proven with the real SDK deserializer + the real cluster response payload):**
- `KustoResultTable.rows()` in azure-kusto-data is a **generator function** (`models.js *rows()`); generators are not indexable, so the fallback's `rows()[0]` was `undefined` → `_showMaterializedViewsViaSchema` silently returned `[]` (no throw, never reached the warn branch)
- Unit tests missed it because the mocks return plain **arrays** (indexable) — mock-fidelity gap
- Proof: `KustoResponseDataSetV1` over the actual `.show database schema as json` response → `rows() is generator: true`, `rows()[0] === undefined`, buggy helper → `[]`

**What was done:**
- `_showMaterializedViewsViaSchema` now iterates `rows()` with `for..of` (works on generators and arrays) and takes the first row
- Fallback-test mock switched to a **generator-based** `rows()`; new regression test drives the **real** `KustoResponseDataSetV1` deserializer over a realistic payload — **65 tests, all green**
- End-to-end verification (offline, no cluster connection needed): real deserializer + real saved response through the fixed helper → `["MaterializedView"]` ✓

**Lesson:** any code that touches SDK result tables must iterate `rows()`; array-style mocks hide generator behavior. Consider asserting `rows()` fidelity in future mocks.

**Next:** 0004 — Kusto IntelliSense (create spec; can reuse the resource list from 0003).

## 2026-09-03 — 0003 bugfix #2: MVs now listed via schema-JSON fallback (commit `ad8826b`)

**Task:** 0003 follow-up — "materialized views are not displayed, always 0, but they exist in a few databases" — **FIXED**

**Diagnosis (read-only probes against the real cluster):**
- User was right: every database contains MVs (`MicroWeatherView`, `GeoJsonView` + 2 more, etc.) — confirmed via `.show database schema as json` (HTTP 200, full `MaterializedViews` map)
- `.show materialized views` fails cluster-wide with a **parser-level** error: `Syntax error: SYN0002: A recognition error occurred. [1:6]` — the engine doesn't recognize the command, despite the MVs existing (earlier "no MV support" theory corrected)
- The previous fix's graceful degradation therefore always produced an empty MV list

**What was done:**
- New `_showMaterializedViewsViaSchema()`: parses `.show database schema as json` → `Object.keys(Databases[db].MaterializedViews)`
- `getResources`: on MV-command failure, tries the schema fallback; only if both fail does it degrade to an empty list (single `console.warn` naming both errors). Healthy clusters never trigger the fallback (asserted by test)
- +1 unit test for the fallback path; happy-path test extended to assert no schema call; **64 tests, all green**
- decisions.md entry (supersedes the previous degradation decision); spec errata corrected
- Side benefit confirmed in the user's `npm start` logs: `describeKustoError` now surfaces the real Kusto error text in the main-process warns

**Recommendation for the user:** the engine not recognizing `.show materialized views` (SYN0002) while MVs exist looks like an engine-side anomaly — worth an Azure support ticket.

**Next:** 0004 — Kusto IntelliSense (create spec; can reuse the resource list from 0003).

## 2026-09-03 — 0003 bugfix: clusters without MV support (commit `9f2e9e5`)

**Task:** 0003 follow-up — resource listing returned 400 "Request failed with status code 400" on the ANOVEDA PROD cluster — **FIXED**

**Diagnosis (reproduced via read-only curl + az token against the real cluster):**
- `.show tables` → 200; `.show materialized views` → 400 `General_BadRequest: Request is invalid and cannot be executed.` on **every** database (engine without MV support, cluster-wide)
- `getResources` awaited both mgmt commands sequentially → the 400 failed the entire resource fetch, discarding the valid tables list
- The toast message was unhelpful because axios error messages hide Kusto's response-body error description

**What was done:**
- `getResources` fetches both lists independently via `Promise.allSettled`: `.show tables` failure stays fatal; MV-command failure degrades to an empty list with a `console.warn` in main
- New `describeKustoError(err)` (exported from `kusto-client.js`) extracts the Kusto error body (plain string or `{ error: { "@message" } }`); all `kusto:*` IPC error envelopes now use it
- +6 tests (5 unit, 1 integration) pinning the degradation, enriched messages, and error-body extraction — **63 total, all green**
- Spec 0003 Notes gained an errata entry; decision logged in `decisions.md`
- Note: live node-to-cluster verification isn't possible from the dev sandbox (corporate TLS interception breaks node's CA bundle; curl works). Verify with `npm start` against the real cluster.

**Next:** 0004 — Kusto IntelliSense (create spec; can reuse the resource list from 0003).

## 2026-09-03 — 0003 Resource listing (commit `1224095`)

**Task:** 0003 — Resource listing (spec `.ai/specs/0003_resource-listing.md`) — **DONE**

**What was done:**
- `KustoClientManager.getResources(url, database, ...)`: database-scoped `.show tables` (map `TableName`) and `.show materialized views` (map `Name`) via `executeMgmt`, per-cluster client cache reuse, empty-database short-circuit (no client, no mgmt call)
- New `kusto:get-resources` IPC channel (success/error envelope, device-code relay) and `adxAPI.getResources()` in preload
- Renderer: "Resources" sidebar section between Clusters and History, with refresh button; tree = active database root → collapsible **Tables** / **Materialized Views** groups; loading / error / empty states; stale-response guard via monotonic request id; fetch triggers on cluster select (via `loadDatabases`), `db-select` change, and refresh click; cluster delete resets the tree
- Right-click custom DOM context menu (viewport-clamped, Escape/blur/click-away dismissal) → "Query 100 rows" inserts `["Name"] | take 100` at the cursor via `editor.replaceSelection` (bracket-quoted, quotes/backslashes escaped)
- Tests: +5 unit (mgmt commands + row mapping, empty-db short-circuit, cache reuse, device-code passthrough, error propagation) and +3 integration (success/error envelope, device-code relay) — **57 total, all green** (`npm test`)
- README features list updated; spec 0003 → DONE; 4 new entries in `decisions.md`

**Decisions:** See `decisions.md` entries dated 2026-09-03 (dedicated mgmt commands; combined `kusto:get-resources` channel; custom DOM context menu; always bracket-quoted insert).

**Next:** 0004 — Kusto IntelliSense (create spec; can reuse the resource list from 0003).

## 2026-09-02 — 0002 Automated test suite (commit `b14475b`)

**Task:** 0002 — Automated test suite (spec `.ai/specs/0002_test-suite.md`) — **DONE**

**What was done:**
- Added Vitest 3 with `tests/{unit,integration,e2e}` layout and `test`/`test:unit`/`test:integration`/`test:e2e`/`test:watch` scripts
- 49 unit + integration tests, all green: store (CRUD, 200-entry cap, cascade delete, corrupted-JSON tolerance, persistence), kusto-client (KCSB per auth mode, cache keying, device-code exclusion, v6 result mapping, executeMgmt), CSV quoting/escaping, and the full IPC surface via injected dependencies
- Playwright (`playwright-core`) E2E smoke test launching the real app with an isolated `KUSTODESK_DATA_DIR`
- Behavior-preserving testability refactors: `Store(dataDir)`, extracted `src/main/csv.js` and `src/main/ipc-handlers.js`; `main.js` is now a thin composition root
- New `.github/workflows/build.yml` ("Build & Test"): ubuntu test job + 3-OS packaging matrix, push/PR-triggered; `release.yml` untouched
- Diagnosed and fixed the macOS "Electron is dangerous" block: Apple revoked the notarization hash of some Electron 31 builds (`Notarization daemon found revoked hash` in `syspolicyd` log). Fix: ad-hoc re-sign via `postinstall` script `scripts/fix-electron-macos-signature.js`; verified by E2E passing
- Documented the `vi.mock`-vs-CJS-`require` gotcha and four other decisions in `decisions.md`; README gained a Development & Testing section and macOS note

**Decisions:** See `decisions.md` entries dated 2026-09-02 (Vitest; testability refactors; separate `build.yml` workflow; Electron ad-hoc re-sign).

**Next:** 0003 — Kusto IntelliSense (create spec).

## 2026-09-02 — Session Summary

**Commits:** `45ea0da`, `b14475b`, `f821d89`

**What was done:**
- `45ea0da` — `.clinerules` added (PCS integration instructions)
- `b14475b` — 0002 Automated test suite: Vitest 3 + 49 unit/integration tests + Playwright E2E smoke; testability refactors (`Store(dataDir)`, `src/main/csv.js`, `src/main/ipc-handlers.js`); `.github/workflows/build.yml` ("Build & Test"); postinstall Electron ad-hoc re-sign fixing Apple's revoked-notarization Gatekeeper block; README + spec + decisions updated
- `f821d89` — progress log entry for 0002

**Status after session:**
- 0002 DONE. 49 unit+integration tests + 1 E2E smoke all green; CI "Build & Test" active on push/PR; `release.yml` untouched. Local commits not yet pushed.

**Next:**
- Push to `main` to trigger the first "Build & Test" run, then start 0003 — Kusto IntelliSense (create `.ai/specs/0003_kusto-intellisense.md`).

## 2026-09-08 - Session Summary

**Commits:** `14d3aa3` (0004 backend chunk). Since the last sync the repo also gained `3bf351f` (version 1.1.0) and `6ea1ed1` (0004 spec committed) outside the assistant session.

**What was done:**
- `14d3aa3` - **0004 backend chunk**: `getSchema()` in kusto-client.js (single `.show database schema as json` mgmt call; empty-db short-circuit; defensive column normalizer for OrderedColumns / object-array / object-map column shapes; failures wrapped with describeKustoError); extracted shared `_fetchDatabaseSchemaNode()` (also used by the 0003 MV fallback); `kusto:get-schema` IPC handler + `adxAPI.getSchema()` preload; +6 unit and +3 integration tests - 74 total green; E2E smoke green; spec 0004 -> IN PROGRESS
- PCS sync: two decision entries appended (completion schema source; custom hint engine over sql-hint); current-state / tasks / progress-log refreshed; .last-sync -> HEAD

**Status after session:**

- 0004 backend done and committed; 74 unit+integration tests + 1 E2E smoke all green; working tree clean; renderer hint engine not started.

**Next:**

- Implement the renderer hint engine: new pure `src/renderer/kusto-hints.js` (curated Kusto keywords/functions, collectIdentifiers, buildCompletions, prefixMatch with cap; UMD shim) + unit tests; then editor integration in app.js/index.html (show-hint.min.js script tag, schema cache keyed by url::database with stale-response guard, custom hint function, Ctrl/Cmd+Space + auto-popup, silent keyword-only fallback on schema failure).
## 2026-09-08 - 0004 renderer hint engine (commit 2347cd9)

**Task:** 0004 chunk 2 - pure hint-engine module - DONE

**What was done:**
- `2347cd9` - src/renderer/kusto-hints.js: dependency-free pure module with UMD shim (window.KustoHints / module.exports): curated Kusto vocabulary (56 keywords incl. join kinds, 89 functions, 10 types), prefixMatch (case-insensitive, cap 50), collectIdentifiers (bracket-quoted names, pipeline-segment starts, join targets; operator exclusion), buildCompletions (dot-scoped columns; tables+MVs; boosted referenced-table columns; all-DB columns; vocabulary - deduped, capped, { text, displayText, hintType } items)
- tests/unit/kusto-hints.test.js: 15 unit tests; they caught two real bugs fixed on the spot (unfiltered column completions bypassing the prefix, a FUNCTIONS block lost to an interrupted file write) - 94 unit+integration tests + E2E smoke green
- `be9935a` - pcs: current-state Next Step -> editor-integration chunk

**Next:**
- Editor integration chunk: show-hint.min.js script tag in index.html, schema cache in app.js keyed by cluster::database with the stale-response guard, custom hint function (Ctrl/Cmd+Space + auto-popup 2+ chars and after dot, suppressed in comments/strings), silent keyword-only degradation on schema failure; then manual spec scenarios 1-6, README bullet, spec 0004 -> DONE.
