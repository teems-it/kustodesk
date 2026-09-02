# Current State

> **Snapshot of where the work is right now.** History goes in `progress-log.md`, not here.
> Update this file at the end of every session (via `/save-progress` or manually).

---

## Active Feature

<!-- Name of the feature currently being worked on, or "None" -->
_None — 0002 (Automated test suite) completed._

## Status

<!-- Brief per-layer or per-area status. Keep it short — a snapshot, not a report. -->

| Area | Status | Notes |
|---|---|---|
| _Backend_ | First version implemented. | `main.js` now a thin composition root; IPC handlers in `ipc-handlers.js`, CSV in `csv.js` |
| _Frontend_ | First version implemented. | — |
| _Tests_ | 49 unit+integration tests + 1 E2E smoke, all green. | Vitest; `npm test` / `npm run test:e2e`; CI in `build.yml` |
| _CI_ | "Build & Test" workflow added (`build.yml`); "Build & Release" unchanged. | Runs on push to `main` + PRs |
| _Docs_ | README dev/testing section + macOS Gatekeeper note. | — |

## Known Issues

<!-- List any known bugs, blockers, or technical debt. Remove this section if empty. -->

- There is no "intelli sense" features supporting kusto syntax
- MacOS recognizes the **packaged** app as not trusted software and denies the installation (dev binary is fixed by the postinstall ad-hoc re-sign; packaged app may need equivalent treatment)
- Renderer (`src/renderer/app.js`) has no automated tests (DOM-heavy, no bundler — candidate follow-up)

## Next Step

<!-- The single next action to take. Must be concrete and actionable. -->

_Start 0003 — Kusto IntelliSense: create `.ai/specs/0003_kusto-intellisense.md` following the feature template._

---

## Architecture References

<!-- Links to your project's architecture docs. PCS doesn't duplicate them — it points to them. -->

- `docs/architecture.md` — _(update this path to match your project)_
- `docs/endpoints.md` — _(update this path to match your project)_