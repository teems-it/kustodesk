# Current State

> **Snapshot of where the work is right now.** History goes in `progress-log.md`, not here.
> Update this file at the end of every session (via `/save-progress` or manually).

---

## Active Feature

<!-- Name of the feature currently being worked on, or "None" -->
_Active feature: none — 0003 (Resource listing) completed. Next: 0004 (Kusto IntelliSense) spec creation._

## Status

<!-- Brief per-layer or per-area status. Keep it short — a snapshot, not a report. -->

| Area | Status | Notes |
|---|---|---|
| _Backend_ | First version implemented. | `main.js` thin composition root; IPC in `ipc-handlers.js`; `getResources()` in `kusto-client.js` |
| _Frontend_ | First version implemented. | Resources sidebar (tables + materialized views, context menu) added in 0003 |
| _Tests_ | 64 unit+integration tests + 1 E2E smoke, all green. | Vitest; `npm test` / `npm run test:e2e`; CI in `build.yml` |
| _CI_ | "Build & Test" workflow added (`build.yml`); "Build & Release" unchanged. | Runs on push to `main` + PRs |
| _Docs_ | README dev/testing section + macOS Gatekeeper note + resource sidebar feature bullet. | — |

## Known Issues

<!-- List any known bugs, blockers, or technical debt. Remove this section if empty. -->

- There is no "intelli sense" features supporting kusto syntax
- MacOS recognizes the **packaged** app as not trusted software and denies the installation (dev binary is fixed by the postinstall ad-hoc re-sign; packaged app may need equivalent treatment)
- Renderer (`src/renderer/app.js`) has no automated tests (DOM-heavy, no bundler — candidate follow-up)

## Next Step

<!-- The single next action to take. Must be concrete and actionable. -->

_Start 0004 — Kusto IntelliSense: create the spec (`.ai/specs/0004_kusto-intellisense.md`). The resource list from 0003 can be reused for table/column completion._

### Manual verification pending (0003 DoD)

- Right-click "Query 100 rows" inserts a runnable `["Name"] | take 100` query against a real cluster (spec test scenario 3) — verify with `npm start` before tagging a release.

---

## Architecture References

<!-- Links to your project's architecture docs. PCS doesn't duplicate them — it points to them. -->

- `docs/architecture.md` — _(update this path to match your project)_
- `docs/endpoints.md` — _(update this path to match your project)_