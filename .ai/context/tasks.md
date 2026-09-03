# Tasks

> **Kanban-style task board.** Only ONE task "In Progress" at a time.
> Move items between sections as work progresses. Don't delete — move to Done.

---

## In Progress

<!-- The single task currently being worked on. Only ONE at a time. -->

- _None_

## Todo

<!-- Upcoming tasks, ordered by priority. -->

- **0003 — Resource listing** (spec: `.ai/specs/0003_resource-listing.md`)
  Sidebar tree of tables + materialized views for the selected database (via `kusto:get-resources` → `.show tables` / `.show materialized views`), with a right-click "Query 100 rows" action that inserts `["Name"] | take 100` into the editor.

- **0004 — Kusto IntelliSense** (spec: to be created; renumbered from 0003)
  Kusto/KQL-aware code completion in the query editor (replacing the generic SQL-mode highlighting-only setup from v1). Can reuse the resource list from 0003 for table/column completion.

## Done

<!-- Completed tasks. Keep a running history. -->

- **0002 — Automated test suite** (spec: `.ai/specs/0002_test-suite.md`) — Vitest runner; 49 unit+integration tests (store CRUD/cap/cascade, kusto-client auth modes + cache keying + v6 result mapping, CSV quoting, full IPC surface); Playwright E2E smoke with `KUSTODESK_DATA_DIR` isolation; testability refactors (`Store(dataDir)`, `src/main/csv.js`, `src/main/ipc-handlers.js`); `.github/workflows/build.yml` ("Build & Test"); postinstall Electron ad-hoc re-sign fixing revoked-notarization Gatekeeper block.

- **0001 — Initial version** (spec: `.ai/specs/0001_initial-version.md`) — full Electron ADX desktop client: multi-cluster CRUD, 3 auth modes (Azure CLI shell-out / Device Code / App Registration), CodeMirror query editor, sortable results table + JSON view, CSV export, per-cluster history, dark UI, mac/win/linux packaging. Verified manually; automated testing deferred to 0002. Key decisions logged in `decisions.md`.