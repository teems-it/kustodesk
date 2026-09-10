# Spec: E2E Tests for Kustodesk

> **Status:** DRAFT  <!-- DRAFT → APPROVED → IN PROGRESS → DONE -->
> **Created:** 2026-09-10
> **Owner:** @gpasnik

---

## Goal

We need automated E2E tests that can be executed in headless mode in CI/CD and have the option to run locally with the preview (a visible app window).

## High-Level Behavior

E2E tests run against a mocked Azure Data Explorer: a local HTTP server impersonates the Kusto REST API. The test data is defined once as fixtures and used both for the mock responses and for the test assertions. A test run starts kustodesk (the real Electron app), runs scenarios, validates the results, and then cleans up (closes the app, removes the isolated data dir). Every implemented feature must be covered with E2E test scenarios.

## Background / Motivation

It gives the possibility to automatically verify whether the application features work properly after every modification — currently only a single launch smoke test exists, and feature verification (query, resources, IntelliSense, export, history) is manual against a real cluster.

---

## Components

### Mock Kusto server
- **Purpose:** Impersonate the ADX REST API so the app talks HTTP to a fake cluster — exercising the real SDK deserializer, IPC, and renderer stack.
- **Type:** new file
- **File(s):** `tests/e2e/helpers/mock-kusto-server.js`
- **Pattern to follow:** dependency-free Node code like the `tests/integration` mocks; realistic payloads validated against the real `azure-kusto-data` deserializers (precedent: the "verified from source" comments in `kusto-client.js` and the generator-`rows()` mock-fidelity lesson of 0003 bugfix #3)
- **Key behavior:**
  - Node `http.Server` handling `POST /v2/rest/query` (query results) and `POST /v1/rest/mgmt` (`.show databases`, `.show tables`, `.show materialized views`, `.show database schema as json`)
  - Dispatches on the request body's query/command text against the fixtures; unknown commands get a realistic Kusto-style error envelope
  - Records every received command/query so tests can assert what the app actually sent
  - Bearer tokens are accepted and ignored (no AAD validation)
  - Started per test file on an ephemeral port; the cluster URL passed to the app is `http://127.0.0.1:<port>`
  - Exact SDK v6 request paths and response shapes must be confirmed from `node_modules/azure-kusto-data` source during implementation

### Test fixtures (single source of truth)
- **Purpose:** One definition of the test data used by both the mock server and the assertions.
- **Type:** new file
- **File(s):** `tests/e2e/fixtures/kusto-fixtures.js`
- **Pattern to follow:** plain constant modules (see the fixtures style used in `tests/unit`)
- **Key behavior:**
  - Cluster definitions (display name, URL pointing at the mock, auth config)
  - A `StormEvents`-style table and a materialized view with columns; query result rows; `.show tables` / `.show materialized views` rows; schema-JSON node (tables, MVs, columns)
  - Error payloads (Kusto error body shapes handled by `describeKustoError`)

### Test-only auth seam
- **Purpose:** Let the E2E app authenticate to the mock without `az`, AAD, or any network traffic to microsoftonline.com.
- **Type:** modification to existing file
- **File(s):** `src/main/kusto-client.js` (`_buildKcsb`)
- **Pattern to follow:** the existing `KUSTODESK_DATA_DIR` test isolation in `main.js` — env-var-guarded, documented as test-only
- **Key behavior:**
  - When `process.env.KUSTODESK_E2E_TOKEN` is set, build the KCSB with `withTokenProvider(url, async () => token)` regardless of the configured auth method
  - Without the env var, behavior is unchanged — all three real auth modes untouched (unit test proves it)

### CSV export seam
- **Purpose:** Make CSV export automatable — the native save dialog cannot be driven by Playwright.
- **Type:** modification to existing file
- **File(s):** `src/main/ipc-handlers.js` (`export:csv` handler)
- **Pattern to follow:** same env-var seam pattern (`KUSTODESK_DATA_DIR`)
- **Key behavior:**
  - When `process.env.KUSTODESK_E2E_EXPORT_DIR` is set, skip `dialog.showSaveDialog` and write the CSV to a uniquely named file in that dir, returning the same `{ success, filePath }` envelope
  - Without the env var, the native dialog flow is unchanged
  - E2E asserts on the written file's contents (`toCsv` output matching fixture rows)

### App-launch helper + scenario suites
- **Purpose:** Shared "launch the app wired to the mock" plumbing, then one suite per feature area.
- **Type:** new files
- **File(s):** `tests/e2e/helpers/launch-app.js`, `tests/e2e/*.test.js` (grouped per feature area — e.g. clusters / query / resources; exact split decided during implementation)
- **Pattern to follow:** `tests/e2e/smoke.test.js` — `playwright-core` `_electron.launch`, `KUSTODESK_DATA_DIR` temp dir + cleanup, `it.skipIf(noDisplay)`, CI args (`--no-sandbox`, `--disable-gpu`)
- **Key behavior:**
  - Helper starts the mock server, creates the isolated data dir, launches the app, returns `{ app, win, mock, cleanup }`
  - Scenarios use Playwright element selectors against the real renderer (cluster form, database dropdown, sidebar, editor, results table, history)
  - Headless-safe like the smoke test (`it.skipIf(noDisplay)`); CI needs zero changes

### Docs
- **Purpose:** Keep documentation in sync.
- **Type:** modification to existing files
- **File(s):** `README.md` (testing section: mocked E2E, local preview run)
- **Key behavior:** README documents the mocked E2E suite and how to run it locally with a visible window

---

## Decision Tree

### Decision 1: How should ADX be mocked?
- **Option A:** Local HTTP mock server impersonating the Kusto REST API — the app connects over real HTTP with the real SDK.
  - Pros: exercises the full stack (SDK deserializer, request paths, IPC, renderer); catches payload/mock-fidelity bugs — exactly the class of the 0003 bugfix #3 generator-`rows()` miss; app code almost untouched
  - Cons: needs mock-server infra and a small auth seam; response payloads must match the real API shapes
- **Option B:** Monkey-patch `KustoClientManager` in the main process (e.g. via `app.evaluate()`) to return canned results.
  - Pros: trivial, no HTTP layer involved
  - Cons: bypasses the SDK/HTTP layer entirely; tests wiring rather than behavior; blind to payload regressions
- **Chosen:** Option A
- **Reason:** The point of this spec is automated verification of real app behavior; a patched manager would leave the most fragile layer (SDK ↔ REST contract) untested.
- **Trade-off:** more mock infrastructure up front; payload fidelity must be validated against the real deserializer.

### Decision 2: How does the E2E app authenticate to the mock?
- **Option A:** Env-var static token provider (`KUSTODESK_E2E_TOKEN` → `withTokenProvider`).
  - Pros: no AAD traffic, no `az` dependency in CI; auth-mode selection/config UX still covered
  - Cons: a small test-only seam in production code; OAuth flows themselves untested
- **Option B:** Dummy app-registration credentials + the mock also faking the AAD token endpoint.
  - Pros: no app-code seam
  - Cons: significantly more mock infra; couples tests to the SDK's auth internals for no feature coverage
- **Chosen:** Option A
- **Reason:** E2E validates the app, not Entra ID; token acquisition internals are out of scope.
- **Trade-off:** device-code/app-registration OAuth round-trips remain unverified by E2E (their IPC surface stays covered by integration tests).

### Decision 3: How is CSV export covered?
- **Option A:** Test-only `KUSTODESK_E2E_EXPORT_DIR` seam bypassing the native save dialog.
  - Pros: end-to-end coverage including the file write and renderer flow
  - Cons: one more guarded seam in production code
- **Option B:** Keep CSV covered by the existing IPC integration test only.
  - Pros: no app changes
  - Cons: leaves one implemented feature without E2E coverage (violates "every implemented feature must be covered")
- **Chosen:** Option A
- **Reason:** The export flow (button → IPC → file) is user-visible behavior; the seam is tiny and mirrors the established `KUSTODESK_DATA_DIR` pattern.
- **Trade-off:** production code carries a test-only branch; the native dialog itself remains untestable.

### Decision 4: Which test runner/layout?
- **Option A:** Stay on Vitest + `playwright-core` `_electron`, extending `tests/e2e/` (suites split per feature area).
  - Pros: consistency with the existing smoke test; single runner; zero CI changes
- **Option B:** Migrate to the Playwright test runner (`@playwright/test` + `playwright.config.js`).
  - Pros: E2E-native fixtures, reporting, retries
  - Cons: new dependency; the existing smoke test must be rewritten
- **Chosen:** Option A
- **Reason:** The current harness already works headless in CI under xvfb; migration adds churn without covering new features.
- **Trade-off:** no Playwright-native retries/reporting — revisit if the suite grows painful under Vitest.

---

## Definition of Done (DoD)

- [ ] Mock Kusto server serves fixtures for query + mgmt endpoints and records received commands
- [ ] Every implemented feature has at least one E2E scenario: cluster CRUD, test connection, database selection, resources sidebar + context menu, query execution (results table, JSON view, sorting), query error surfacing, query history, IntelliSense completions, CSV export
- [ ] Fixture data is the single source of truth for both mock responses and assertions
- [ ] Full run is headless-safe (passes under `xvfb-run -a npm run test:e2e` locally, exactly as CI runs it)
- [ ] Local preview run opens a visible app window (documented in README)
- [ ] Test-only seams (`KUSTODESK_E2E_TOKEN`, `KUSTODESK_E2E_EXPORT_DIR`) are env-guarded and change nothing when unset (unit tests prove it)
- [ ] No regressions in existing tests (97 unit+integration + existing E2E smoke stay green)
- [ ] Code follows existing project conventions
- [ ] Relevant `decisions.md` entries added
- [ ] Docs updated (README testing section)

---

## Test Scenarios

1. **Cluster CRUD**
   - **Given:** The app starts with an isolated (empty) data dir
   - **When:** The user adds a cluster pointing at the mock, then edits and deletes it
   - **Then:** The cluster appears in the sidebar after add, reflects the edit, disappears on delete, and `clusters.json` matches at every step (delete cascades history)

2. **Test connection**
   - **Given:** The add-cluster form is open
   - **When:** The user tests the connection against the mock (success case, then a failure case served by the mock)
   - **Then:** Success reports connectivity; failure surfaces the mocked Kusto error text via `describeKustoError`

3. **Database selection**
   - **Given:** A cluster pointing at the mock is selected
   - **When:** The app loads databases
   - **Then:** The database dropdown lists exactly the fixture databases

4. **Resources sidebar**
   - **Given:** A database with fixture tables and a materialized view is selected
   - **When:** The sidebar loads and the user right-clicks a table
   - **Then:** Tables / Materialized Views render with fixture names; right-click inserts `["Name"] | take 100` into the editor at the cursor

5. **Query execution and results**
   - **Given:** A database is selected and the mock serves fixture rows for the query
   - **When:** The user runs a query (`⌘/Ctrl+Enter` or Run Query)
   - **Then:** The results table shows the fixture rows (row count, cell values); sorting works; the JSON tab matches the rows; a history entry with row count and execution time appears and reloads the query on click

6. **Query error surfacing**
   - **Given:** The mock is configured to fail the query with a Kusto error body
   - **When:** The user runs the query
   - **Then:** The error is surfaced in the UI; the app stays functional (a subsequent successful query works)

7. **IntelliSense completions**
   - **Given:** The mock serves the fixture schema for the selected database
   - **When:** The user types a table prefix and triggers completion (and types `Table.` for columns)
   - **Then:** Fixture tables/columns are suggested (regression guard for 0004 behavior over the real backend → IPC → renderer path)

8. **CSV export**
   - **Given:** A query result from fixtures is displayed and `KUSTODESK_E2E_EXPORT_DIR` is set
   - **When:** The user clicks Export CSV
   - **Then:** A CSV file appears in the export dir whose contents equal `toCsv(columns, rows)` for the fixture rows; the UI reports success

---

## Out of Scope

- Testing real AAD/OAuth flows (device code, app registration) — the E2E suite validates the app against the mock, not Entra ID; those surfaces stay covered by unit/integration tests
- `az` CLI auth in E2E (requires `az` plus a real login; CI has neither)
- Packaged-app testing — E2E runs against the dev binary via `electron .`
- Renderer unit/DOM tests outside E2E (existing project convention; E2E now covers the renderer indirectly)
- Load/performance testing; stored functions / external tables / update policies (not implemented yet, so nothing to cover)
- Full KQL query semantics in the mock — it dispatches on literal command text and returns fixtures; it does not evaluate Kusto

---

## Notes

- CI needs no changes: `build.yml` already runs `xvfb-run -a npm run test:e2e` over all of `tests/e2e/`
- Data-dir isolation via `KUSTODESK_DATA_DIR` (existing `main.js` seam) is reused; cleanup removes the temp dir — matching the spec's "start, run, validate, clean-up" requirement
- Mock responses must be validated against the real `azure-kusto-data` deserializers (`KustoResponseDataSetV1`/`V2`) during implementation; never index `rows()[0]` — the 0003 bugfix #3 lesson (`rows()` is a generator)
- The mock can also cover the SYN0002-style fallback path (serve `.show materialized views` as rejected + schema-JSON fallback) if a scenario warrants it — optional reuse of the 0003 behavior
- Local debugging: run the E2E suite without xvfb for a visible window, or set `PWDEBUG=1` for step-through