# Tasks

> **Kanban-style task board.** Only ONE task "In Progress" at a time.
> Move items between sections as work progresses. Don't delete — move to Done.

---

## In Progress

<!-- The single task currently being worked on. Only ONE at a time. -->

- _Empty_

## Todo

<!-- Upcoming tasks, ordered by priority. -->

- **0005 — E2E tests with mocked ADX** (spec: `.ai/specs/0005_e2e-tests.md`, APPROVED) — ordered so each task is independently committable:
  1. [ ] **Prep: SDK REST contract verification + mock-server core** — read `node_modules/azure-kusto-data` source to pin the exact request paths (`/v2/rest/query`, `/v1/rest/mgmt`), request bodies, and response envelopes; build `tests/e2e/helpers/mock-kusto-server.js` (dispatch on command text, received-command recorder, bearer-ignored) with unit tests pinning payload fidelity against the real `KustoResponseDataSetV1`/`V2` deserializers (generator `rows()` — never index it)
  2. [ ] **Prep: app test seams** — `KUSTODESK_E2E_TOKEN` static-token provider in `_buildKcsb` (`src/main/kusto-client.js`) + `KUSTODESK_E2E_EXPORT_DIR` in the `export:csv` handler (`src/main/ipc-handlers.js`); unit tests proving both are no-ops when unset and all three real auth modes are untouched
  3. [ ] **Fixtures: single source of truth** — `tests/e2e/fixtures/kusto-fixtures.js`: cluster definitions, `StormEvents`-style table + materialized view + columns, query result rows, `.show tables`/`.show materialized views` rows, schema-JSON node, error payloads; wire the mock server's default dataset to the fixtures
  4. [ ] **Wiring: launch helper + smoke extension** — `tests/e2e/helpers/launch-app.js` (mock server + isolated data dir + `KUSTODESK_E2E_TOKEN` + cleanup, `it.skipIf(noDisplay)` pattern); extend `smoke.test.js` to also boot the app against the mock — proves the full wiring before any scenario exists
  5. [ ] **Scenarios: cluster lifecycle** — add/edit/delete cluster + `clusters.json` persistence + history cascade, test-connection success/failure, database dropdown from mock (spec scenarios 1–3)
  6. [ ] **Scenarios: query execution** — results table (row count, cells), sorting, JSON tab, history entry + reload on click, error surfacing + recovery (spec scenarios 5–6)
  7. [ ] **Scenarios: resources + IntelliSense** — sidebar tables/MVs from mock, right-click `["Name"] | take 100` insert, completions from mocked schema incl. `Table.` columns (spec scenarios 4, 7)
  8. [ ] **Scenarios: CSV export** — export writes a file whose contents equal `toCsv(columns, rows)` for the fixture rows (spec scenario 8)
  9. [ ] **Wrap-up** — headless verification (`xvfb-run -a npm run test:e2e` locally, same as CI), README testing section (mocked E2E + local preview), spec → DONE, `/save-progress`

  (After 0005, feature candidates remain: fold `getResources` + `getSchema` behind one IPC channel; packaged-macOS Gatekeeper treatment; Azure support ticket for the ANOVEDA PROD SYN0002 anomaly)

## Done

<!-- Completed tasks. Keep a running history. -->

- **0004 — Kusto IntelliSense** (spec: `.ai/specs/0004_kusto-intellisense.md`) — `getSchema()` (single `.show database schema as json` call, defensive column normalizer, empty-db short-circuit) + `kusto:get-schema` IPC + `adxAPI.getSchema()` preload (14d3aa3); pure hint engine `src/renderer/kusto-hints.js` (UMD shim; curated vocabulary, prefixMatch, collectIdentifiers, buildCompletions) + unit tests (2347cd9); editor integration (show-hint.min.js, schema cache keyed `url::database` + stale guard, custom kustoHint with dot-completion, Ctrl/⌘+Space + auto-popup, comment/string suppression, dark popup theme, README bullet — c84d35f). Manual verification surfaced two bugs, fixed during verification: missing script tag (8a5c780 + E2E regression guard) and cross-resource column suggestions → SEM0100 (a96b78a: case-insensitive `findResource()` + referenced-resource-only column scoping). 97 unit+integration + E2E green; all 6 spec scenarios + spot-checks verified.

- **0003 — Resource listing** (spec: `.ai/specs/0003_resource-listing.md`) — `KustoClientManager.getResources()` (`.show tables` / `.show materialized views` via `executeMgmt`, client-cache reuse, empty-db short-circuit); `kusto:get-resources` IPC channel + `adxAPI.getResources()` preload bridge; "Resources" sidebar section with collapsible Tables / Materialized Views groups, loading/error/empty states, stale-response guard, refresh button; right-click context menu inserting `["Name"] | take 100` at the cursor. 8 new tests (5 unit, 3 integration) — 57 total green.

- **0002 — Automated test suite** (spec: `.ai/specs/0002_test-suite.md`) — Vitest runner; 49 unit+integration tests (store CRUD/cap/cascade, kusto-client auth modes + cache keying + v6 result mapping, CSV quoting, full IPC surface); Playwright E2E smoke with `KUSTODESK_DATA_DIR` isolation; testability refactors (`Store(dataDir)`, `src/main/csv.js`, `src/main/ipc-handlers.js`); `.github/workflows/build.yml` ("Build & Test"); postinstall Electron ad-hoc re-sign fixing revoked-notarization Gatekeeper block.

- **0001 — Initial version** (spec: `.ai/specs/0001_initial-version.md`) — full Electron ADX desktop client: multi-cluster CRUD, 3 auth modes (Azure CLI shell-out / Device Code / App Registration), CodeMirror query editor, sortable results table + JSON view, CSV export, per-cluster history, dark UI, mac/win/linux packaging. Verified manually; automated testing deferred to 0002. Key decisions logged in `decisions.md`.
