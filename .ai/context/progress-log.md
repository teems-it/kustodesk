# Progress Log

> **Chronological session log — append a dated entry after each `/save-progress`.**
> Each entry references commit SHAs and summarizes what was accomplished.
> This file is history — append-only, never rewrite past entries.

---

<!-- Add new session entries below, newest first. -->

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

