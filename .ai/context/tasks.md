# Tasks

> **Kanban-style task board.** Only ONE task "In Progress" at a time.
> Move items between sections as work progresses. Don't delete — move to Done.

---

## In Progress

<!-- The single task currently being worked on. Only ONE at a time. -->

- _None_

## Todo

<!-- Upcoming tasks, ordered by priority. -->

- **0002 — Automated test suite** (spec: `.ai/specs/0002_test-suite.md`, to be created)
  Introduce a test runner (e.g. Vitest/Jest) + CI wiring, then cover:
  - Unit: `store.js` (CRUD, 200-entry history cap, cascade delete), `kusto-client.js` (KCSB building per auth mode, cache keying, device-code exclusion), CSV quoting/escaping
  - Integration: IPC handlers (`clusters:*`, `kusto:*`, `history:*`, `export:csv`)
  - E2E smoke: packaged app (launch → auth → query → export)

  *(Test scenarios from spec 0001 serve as the initial test-case list; DoD items deferred there.)*

- **0003 — Kusto IntelliSense** (spec: `.ai/specs/0003_kusto-intellisense.md`, to be created)
  Kusto/KQL-aware code completion in the query editor (replacing the generic SQL-mode highlighting-only setup from v1).

## Done

<!-- Completed tasks. Keep a running history. -->

- **0001 — Initial version** (spec: `.ai/specs/0001_initial-version.md`) — full Electron ADX desktop client: multi-cluster CRUD, 3 auth modes (Azure CLI shell-out / Device Code / App Registration), CodeMirror query editor, sortable results table + JSON view, CSV export, per-cluster history, dark UI, mac/win/linux packaging. Verified manually; automated testing deferred to 0002. Key decisions logged in `decisions.md`.