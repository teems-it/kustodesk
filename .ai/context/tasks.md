# Tasks

> **Kanban-style task board.** Only ONE task "In Progress" at a time.
> Move items between sections as work progresses. Don't delete — move to Done.

---

## In Progress

<!-- The single task currently being worked on. Only ONE at a time. -->

- **0004 - Kusto IntelliSense** (spec: `.ai/specs/0004_kusto-intellisense.md`, IN PROGRESS) - backend done (getSchema + kusto:get-schema IPC + preload, commit 14d3aa3), pure hint-engine module done (src/renderer/kusto-hints.js + 15 unit tests, commit 2347cd9), editor integration done (show-hint.min.js script tag, schema cache + monotonic stale-response guard in app.js, custom kustoHint fn with dot-completion, Ctrl/Cmd+Space + auto-popup, comment/string suppression, dark popup theme, README bullet — commit c84d35f; 94 unit+integration tests + E2E green). **Bugfix 8a5c780:** manual verification found scenarios 1-3 dead — the kusto-hints.js script tag was missing from index.html so window.KustoHints was undefined and kustoHint() threw on every invocation; script tag added + E2E smoke regression guard (asserts KustoHints/showHint in the loaded renderer). Next: re-run manual verification of spec scenarios 1-6 with npm start, then spec -> DONE.

## Todo

<!-- Upcoming tasks, ordered by priority. -->

- _Empty_

## Done

<!-- Completed tasks. Keep a running history. -->

- **0003 — Resource listing** (spec: `.ai/specs/0003_resource-listing.md`) — `KustoClientManager.getResources()` (`.show tables` / `.show materialized views` via `executeMgmt`, client-cache reuse, empty-db short-circuit); `kusto:get-resources` IPC channel + `adxAPI.getResources()` preload bridge; "Resources" sidebar section with collapsible Tables / Materialized Views groups, loading/error/empty states, stale-response guard, refresh button; right-click context menu inserting `["Name"] | take 100` at the cursor. 8 new tests (5 unit, 3 integration) — 57 total green.

- **0002 — Automated test suite** (spec: `.ai/specs/0002_test-suite.md`) — Vitest runner; 49 unit+integration tests (store CRUD/cap/cascade, kusto-client auth modes + cache keying + v6 result mapping, CSV quoting, full IPC surface); Playwright E2E smoke with `KUSTODESK_DATA_DIR` isolation; testability refactors (`Store(dataDir)`, `src/main/csv.js`, `src/main/ipc-handlers.js`); `.github/workflows/build.yml` ("Build & Test"); postinstall Electron ad-hoc re-sign fixing revoked-notarization Gatekeeper block.

- **0001 — Initial version** (spec: `.ai/specs/0001_initial-version.md`) — full Electron ADX desktop client: multi-cluster CRUD, 3 auth modes (Azure CLI shell-out / Device Code / App Registration), CodeMirror query editor, sortable results table + JSON view, CSV export, per-cluster history, dark UI, mac/win/linux packaging. Verified manually; automated testing deferred to 0002. Key decisions logged in `decisions.md`.
