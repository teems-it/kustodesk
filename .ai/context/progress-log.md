# Progress Log

> **Chronological session log — append a dated entry after each `/save-progress`.**
> Each entry references commit SHAs and summarizes what was accomplished.
> This file is history — append-only, never rewrite past entries.

---

<!-- Add new session entries below, newest first. -->

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

