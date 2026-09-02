# Spec: Automated test suite

> **Status:** DONE  <!-- DRAFT → APPROVED → IN PROGRESS → DONE -->
> **Created:** 2026-09-02
> **Owner:** @gpasnik

---

## Goal

Introduce an automated test suite for Kustodesk (unit, integration, and a best-effort Electron E2E smoke test) plus a GitHub Actions "Build & Test" workflow, so regressions are caught on every push/PR instead of only through manual verification at release time.

## High-Level Behavior

- `npm test` runs unit + integration tests instantly with Vitest (no Electron needed).
- `npm run test:e2e` launches the real Electron app headless-safe (skips when no display) and asserts the window opens and the renderer mounts.
- A new `Build & Test` workflow (`.github/workflows/ci.yml`) runs on push to `main` and on PRs: a fast ubuntu test job, and the same 3-OS packaging build matrix as `release.yml`. It never publishes releases.

## Background / Motivation

Spec `0001` delivered the full app but deferred all automated testing (DoD items and test scenarios were explicitly pushed to `0002`). All v1 verification was manual. The storage, auth, and CSV-export paths have real edge-case behavior (200-entry history cap, cascade delete, cache keying, CSV quoting) that is easy to break silently.

---

## Components

### Vitest test runner
- **Purpose:** Fast unit/integration test execution with native module mocking.
- **Type:** config change
- **File(s):** `package.json` (devDependency + `test*` scripts)
- **Pattern to follow:** None yet — first test infra in the repo.
- **Key behavior:**
  - `test` → `vitest run tests/unit tests/integration`
  - `test:e2e` → `vitest run tests/e2e` (separate: needs a display)
  - `test:watch` → `vitest` (watch mode)

### Testability refactor: `Store`
- **Purpose:** Make the store constructible in plain Node without Electron.
- **Type:** modification to existing file
- **File(s):** `src/main/store.js`
- **Key behavior:**
  - `constructor(dataDir)` — optional override; falls back to `app.getPath('userData')`. `main.js` call sites unchanged.

### Testability refactor: CSV builder
- **Purpose:** Pure, unit-testable CSV serialization (quoting, `""` escaping, objects → JSON, null/undefined → empty cell).
- **Type:** new file
- **File(s):** `src/main/csv.js` (extracted verbatim from the `export:csv` handler in `main.js`)
- **Key behavior:**
  - `toCsv(columns, rows) → string`; `main.js` handler calls it then writes the file.

### Testability refactor: IPC handler registration
- **Purpose:** Integration-test the full IPC surface (`clusters:*`, `kusto:*`, `history:*`, `export:csv`) without launching Electron.
- **Type:** new file + modification to `main.js`
- **File(s):** `src/main/ipc-handlers.js`, `src/main/main.js`
- **Key behavior:**
  - `registerIpcHandlers({ ipcMain, store, kustoManager, dialog, getWindow })` — all Electron touchpoints injected.
  - `main.js` keeps only the PATH fix, app lifecycle, window creation, and one `registerIpcHandlers` call.
  - New env override `KUSTODESK_DATA_DIR` → `app.setPath('userData', ...)` before `Store` is created, so E2E runs never touch the developer's real `userData`.

### Unit tests
- **Type:** new files
- **File(s):** `tests/unit/store.test.js`, `tests/unit/kusto-client.test.js`, `tests/unit/csv.test.js`
- **Key behavior:**
  - **store:** CRUD, update-miss → `null`, `touchCluster`, history newest-first ordering, **200-entry cap**, **cascade delete**, per-cluster history filtering, corrupted-JSON tolerance, persistence across instances (real temp dirs, real fs).
  - **kusto-client:** KCSB built per auth mode (`withTokenProvider` / `withAadDeviceAuthentication` / `withAadApplicationKeyAuthentication`), unknown method throws, `az` token failure wrapped, `az` tenant arg passthrough, cache keying (`url::tenantId:clientId` for app-registration, `url::authMethod` otherwise), device-code never cached, `invalidate()`, `execute`/`getDatabases` mapping of v6 `rows()`/`toJSON()`, mgmt via `executeMgmt`. `azure-kusto-data` and `child_process` are mocked.

### Integration tests
- **File(s):** `tests/integration/ipc-handlers.test.js`
- **Key behavior:**
  - Fake `ipcMain` captures registered handlers; invoke each with stubbed `store`/`kustoManager`/`dialog`.
  - Success/error envelopes for `kusto:*`, client invalidation on `clusters:delete`, history recording + `touchCluster` on `kusto:execute`, device-code message relayed via `event.sender.send`, dialog-cancel path for CSV export (no file written).

### E2E smoke test
- **File(s):** `tests/e2e/smoke.test.js`
- **Key behavior:**
  - `playwright-core` `_electron.launch()` with `KUSTODESK_DATA_DIR` pointing at a temp dir; asserts the first window opens, loads `index.html`, and the app doesn't crash. Skips on displayless Linux without xvfb.

### CI workflow
- **Type:** new file
- **File(s):** `.github/workflows/ci.yml`
- **Pattern to follow:** `.github/workflows/release.yml` (checkout/setup-node/npm ci/Ubuntu apt deps steps reused verbatim where possible).
- **Key behavior:**
  - `name: Build & Test`; triggers: `push` to `main`, `pull_request`.
  - `test` job (ubuntu-latest): `npm test` + `xvfb-run npm run test:e2e`.
  - `build` job: same 3-OS matrix as `release.yml`, `CSC_IDENTITY_AUTO_DISCOVERY: false`; artifacts uploaded for debugging only.
  - No release publishing, no tag trigger — fully separate from `Build & Release`.

---

## Decision Tree

### Test runner: Vitest vs Jest
- **Option A:** Vitest
  - Pros: zero-config CJS interop, fast, first-class `vi.mock`/`vi.hoisted`, works on Node 20 + 24.
  - Cons: newer ecosystem than Jest.
- **Option B:** Jest
  - Pros: ubiquitous, familiar.
  - Cons: slower, needs extra config for ESM mocking and modern Node.
- **Chosen:** Option A (Vitest)
- **Reason:** Smallest config surface for a CJS Electron codebase with heavy module mocking.
- **Trade-off:** Less ecosystem familiarity than Jest.

### How to make Electron-coupled modules testable
- **Option A:** Refactor for dependency injection (`Store(dataDir)`, extract `csv.js` + `ipc-handlers.js`).
- **Option B:** Keep everything in `main.js` and mock the `electron` module everywhere.
- **Chosen:** Option A
- **Reason:** Pure functions and injected deps test in plain Node with no Electron mock gymnastics; `main.js` becomes a thin composition root.
- **Trade-off:** Small one-time refactor of `main.js` (behavior-preserving).

### E2E scope
- **Option A:** Full packaged E2E (launch → auth → query → export) against a live ADX cluster.
- **Option B:** Launch smoke test only; real-auth E2E deferred.
- **Chosen:** Option B
- **Reason:** Real auth needs live credentials and a reachable cluster — not suitable for CI.
- **Trade-off:** Auth/query flows remain covered by mocked integration tests, not a real end-to-end run.

---

## Definition of Done (DoD)

- [x] `npm test` runs unit + integration suites green in plain Node (49 tests)
- [x] `npm run test:e2e` launches the Electron app against an isolated data dir
- [x] Storage, auth, and CSV edge cases from spec 0001's test scenarios are covered
- [x] `.github/workflows/build.yml` runs Build & Test on push/PR without touching the release workflow
- [x] No regressions in existing behavior (refactors are behavior-preserving; E2E verifies the app still starts)
- [x] Relevant `decisions.md` entries added
- [x] Docs updated (README dev section, current-state)

---

## Test Scenarios

1. **History cap**
   - **Given:** A store with ≥205 history entries
   - **When:** Entries are added
   - **Then:** `history.json` keeps exactly the 200 newest, newest first

2. **Cascade delete**
   - **Given:** A cluster with history entries
   - **When:** `deleteCluster(id)` runs
   - **Then:** The cluster is gone and only its history entries are removed

3. **Client cache keying**
   - **Given:** Two clusters sharing a URL but different app-registration credentials
   - **When:** Clients are created for both
   - **Then:** Two distinct clients are cached (key includes `tenantId:clientId`); a repeat request reuses the cached instance

4. **Device-code clients never cached**
   - **Given:** Two consecutive device-code operations on the same cluster
   - **When:** Each creates a client
   - **Then:** Two fresh clients are constructed

5. **CSV quoting**
   - **Given:** Cells containing quotes, commas, newlines, objects, and nulls
   - **When:** `toCsv` serializes the result set
   - **Then:** Quotes are doubled, everything is quoted, objects are JSON-serialized, null/undefined are empty cells

6. **IPC error envelope**
   - **Given:** `kustoManager.execute` rejects
   - **When:** The `kusto:execute` handler runs
   - **Then:** Renderer receives `{ success: false, error }` and nothing is recorded to history

7. **CSV export cancel**
   - **Given:** The user cancels the save dialog
   - **When:** The `export:csv` handler runs
   - **Then:** `{ success: false }` is returned and no file is written

8. **App smoke launch**
   - **Given:** The app launched with an isolated `KUSTODESK_DATA_DIR`
   - **When:** The first window opens
   - **Then:** It loads `index.html` and no fatal crash occurs

---

## Out of Scope

- Real-auth E2E against a live ADX cluster (launch → auth → query → export)
- Renderer unit tests (`src/renderer/app.js` — DOM-heavy, no bundler; candidate for a follow-up)
- Code coverage thresholds / reporting
- CI on OSes beyond the existing build matrix; multi-Node test matrix
- Encrypted secrets storage (existing known debt)

---

## Notes

- Test scenarios 1–7 derive from spec `0001`'s deferred DoD items and test-scenario list.
- CI deliberately mirrors `release.yml`'s build matrix so packaging breakage is caught pre-release.
- Reference: existing decisions in `decisions.md` on CLI shell-out auth, JSON storage, client caching.

