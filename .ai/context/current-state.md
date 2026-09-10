# Current State

> **Snapshot of where the work is right now.** History goes in `progress-log.md`, not here.
> Update this file at the end of every session (via `/save-progress` or manually).

---

## Active Feature

<!-- Name of the feature currently being worked on, or "None" -->
_Active feature: 0005 E2E tests with mocked ADX — spec finalized & APPROVED (8d1cca5), work split into 9 tasks (tasks.md Todo). Implementation not started; Task 1 is next._

## Status

<!-- Brief per-layer or per-area status. Keep it short — a snapshot, not a report. -->

| Area | Status | Notes |
|---|---|---|
| _Backend_ | First version implemented. | `main.js` thin composition root; IPC in `ipc-handlers.js`; `getResources()` in `kusto-client.js` |
| _Frontend_ | First version implemented. | Resources sidebar (tables + materialized views, context menu) added in 0003 |
| _Tests_ | 94 unit+integration tests + 1 E2E smoke, all green. | Vitest; `npm test` / `npm run test:e2e`; CI in `build.yml` |
| _CI_ | "Build & Test" workflow added (`build.yml`); "Build & Release" unchanged. | Runs on push to `main` + PRs |
| _Docs_ | README dev/testing section + macOS Gatekeeper note + resource sidebar feature bullet. |
| _0004 backend_ | Done: getSchema + kusto:get-schema IPC + preload (14d3aa3) | - |
| _0004 hint engine_ | Done: kusto-hints.js pure module + 15 unit tests (2347cd9) | - |
| _0004 IntelliSense_ | **DONE** — backend (14d3aa3), hint engine (2347cd9), editor integration (c84d35f); verification bugfixes 8a5c780 + a96b78a; spec → DONE | 97 unit+integration + E2E green |
| _0005 planning_ | Done — spec finalized & APPROVED (8d1cca5); 9-task breakdown in tasks.md Todo | Implementation not started; Task 1 = SDK contract verification + mock-server core |

## Known Issues

<!-- List any known bugs, blockers, or technical debt. Remove this section if empty. -->

- MacOS recognizes the **packaged** app as not trusted software and denies the installation (dev binary is fixed by the postinstall ad-hoc re-sign; packaged app may need equivalent treatment)
- Renderer (`src/renderer/app.js`) has no automated tests (DOM-heavy, no bundler — candidate follow-up; partially mitigated by the E2E in-renderer KustoHints/showHint regression guard added in 8a5c780)
- ANOVEDA PROD cluster rejects `.show materialized views` with a parser-level SYN0002 error although MVs exist (confirmed via schema JSON); worked around in `getResources` via the schema-JSON fallback — an Azure support ticket is recommended

## Next Step

<!-- The single next action to take. Must be concrete and actionable. -->

_0005 E2E tests — start Task 1 (see tasks.md Todo): verify the `azure-kusto-data` v6 REST contract from `node_modules` source (request paths, bodies, response envelopes), then build the mock-server core `tests/e2e/helpers/mock-kusto-server.js` with unit tests pinning payload fidelity against the real `KustoResponseDataSetV1`/`V2` deserializers. Spec: `.ai/specs/0005_e2e-tests.md` (APPROVED)._

### Manual verification pending (0003 DoD)

- Right-click "Query 100 rows" inserts a runnable `["Name"] | take 100` query against a real cluster (spec test scenario 3) — verify with `npm start` before tagging a release.

---

## Architecture References

<!-- Links to your project's architecture docs. PCS doesn't duplicate them — it points to them. -->

- `docs/architecture.md` — _(update this path to match your project)_
- `docs/endpoints.md` — _(update this path to match your project)_