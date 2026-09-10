# Tasks

> **Kanban-style task board.** Only ONE task "In Progress" at a time.
> Move items between sections as work progresses. Don't delete — move to Done.

---

## In Progress

<!-- The single task currently being worked on. Only ONE at a time. -->

- _Empty_

## Todo

<!-- Upcoming tasks, ordered by priority. -->

- _Empty_ (candidates: fold getResources + getSchema behind one IPC channel — spec 0004 Decision 1 trade-off; packaged-macOS Gatekeeper treatment; Azure support ticket for the ANOVEDA PROD SYN0002 anomaly)

## Done

<!-- Completed tasks. Keep a running history. -->

- **0004 — Kusto IntelliSense** (spec: `.ai/specs/0004_kusto-intellisense.md`) — `getSchema()` (single `.show database schema as json` call, defensive column normalizer, empty-db short-circuit) + `kusto:get-schema` IPC + `adxAPI.getSchema()` preload (14d3aa3); pure hint engine `src/renderer/kusto-hints.js` (UMD shim; curated vocabulary, prefixMatch, collectIdentifiers, buildCompletions) + unit tests (2347cd9); editor integration (show-hint.min.js, schema cache keyed `url::database` + stale guard, custom kustoHint with dot-completion, Ctrl/⌘+Space + auto-popup, comment/string suppression, dark popup theme, README bullet — c84d35f). Manual verification surfaced two bugs, fixed during verification: missing script tag (8a5c780 + E2E regression guard) and cross-resource column suggestions → SEM0100 (a96b78a: case-insensitive `findResource()` + referenced-resource-only column scoping). 97 unit+integration + E2E green; all 6 spec scenarios + spot-checks verified.

- **0003 — Resource listing** (spec: `.ai/specs/0003_resource-listing.md`) — `KustoClientManager.getResources()` (`.show tables` / `.show materialized views` via `executeMgmt`, client-cache reuse, empty-db short-circuit); `kusto:get-resources` IPC channel + `adxAPI.getResources()` preload bridge; "Resources" sidebar section with collapsible Tables / Materialized Views groups, loading/error/empty states, stale-response guard, refresh button; right-click context menu inserting `["Name"] | take 100` at the cursor. 8 new tests (5 unit, 3 integration) — 57 total green.

- **0002 — Automated test suite** (spec: `.ai/specs/0002_test-suite.md`) — Vitest runner; 49 unit+integration tests (store CRUD/cap/cascade, kusto-client auth modes + cache keying + v6 result mapping, CSV quoting, full IPC surface); Playwright E2E smoke with `KUSTODESK_DATA_DIR` isolation; testability refactors (`Store(dataDir)`, `src/main/csv.js`, `src/main/ipc-handlers.js`); `.github/workflows/build.yml` ("Build & Test"); postinstall Electron ad-hoc re-sign fixing revoked-notarization Gatekeeper block.

- **0001 — Initial version** (spec: `.ai/specs/0001_initial-version.md`) — full Electron ADX desktop client: multi-cluster CRUD, 3 auth modes (Azure CLI shell-out / Device Code / App Registration), CodeMirror query editor, sortable results table + JSON view, CSV export, per-cluster history, dark UI, mac/win/linux packaging. Verified manually; automated testing deferred to 0002. Key decisions logged in `decisions.md`.
