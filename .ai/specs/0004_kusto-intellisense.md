# Spec: Kusto Intellisense

> **Status:** DONE  <!-- DRAFT → APPROVED → IN PROGRESS → DONE -->
> **Created:** 2026-09-03
> **Owner:** @gpasnik

---

## Goal

We want to have syntax completion feature.

## High-Level Behavior

When writing a kusto query to ADX we want to have syntax completion suggestions. 
The suggestions could be the keywords from kusto syntax or names of the resources like Table or MaterializedView names or table or materialized views column names.

## Background / Motivation

It will speed up writing some queries.

---

## Components

### Schema fetcher (`KustoClientManager.getSchema`)
- **Purpose:** Fetch the tables, materialized views, and their columns of a database with a single management call.
- **Type:** modification to existing file
- **File(s):** `src/main/kusto-client.js`
- **Pattern to follow:** `getResources()` / `_showMaterializedViewsViaSchema()` — `executeMgmt`, generator `rows()` iteration (never index `rows()[0]`), client-cache reuse, empty-db short-circuit, `describeKustoError` on failure
- **Key behavior:**
  - `getSchema(url, database, authMethod, authConfig, onDeviceCodeMessage)` → `{ tables: { [name]: string[] }, materializedViews: { [name]: string[] } }` (map of resource name → ordered column-name list; empty object when the database has none)
  - Single mgmt call: `executeMgmt(database, '.show database schema as json')`; parse the JSON payload exactly as `_showMaterializedViewsViaSchema` does (`Databases[database] || first database`)
  - Extract `Tables` and `MaterializedViews` — tolerate either columns-as-array or columns-as-object shapes with a defensive normalizer
  - Empty database → `{ tables: {}, materializedViews: {} }` without any mgmt call or client creation
  - Any failure throws an error described by `describeKustoError` (surfaced via the standard envelope; never a partial/undefined result)

### IPC channel
- **Purpose:** Expose the database schema to the renderer.
- **Type:** modification to existing files
- **File(s):** `src/main/ipc-handlers.js`, `src/main/preload.js`
- **Pattern to follow:** `kusto:get-resources` handler — success/error envelope, device-code callback via `makeDeviceCodeCallback`, `ALL_CHANNELS` registration
- **Key behavior:**
  - `kusto:get-schema` with `{ url, database, authMethod, authConfig }` → `{ success, schema: { tables, materializedViews } }` or `{ success: false, error }` (via `describeKustoError`)
  - Preload: `adxAPI.getSchema(params)` exposed on `contextBridge`
  - Tests: register the channel in `tests/integration/ipc-handlers.test.js`'s `ALL_CHANNELS` coverage

### Hint engine (static vocabulary + pure helpers)
- **Purpose:** The Kusto keyword/function vocabulary and the pure completion-assembly logic, kept testable.
- **Type:** new file
- **File(s):** `src/renderer/kusto-hints.js`
- **Pattern to follow:** `src/main/csv.js` — a dependency-free module of pure functions; attach to `window` for the no-bundler renderer but also export via a `module.exports` guard (UMD shim) so Vitest can require it
- **Key behavior:**
  - Curated static lists: Kusto query operators/keywords (`where`, `extend`, `summarize`, `project`, `join kinds`, `take`, `render`, …), tabular/scalar built-in functions (`count()`, `sum()`, `strcat()`, `todouble()`, `datetime()`, …), and common data types
  - Pure helpers (no DOM/CodeMirror references): `collectIdentifiers(code)` → tables referenced in the query text (best-effort regex — no full KQL parser), `buildCompletions(prefix, context, schema, keywords)` → ranked completion list (`{ text, displayText, hintType }`; tables/MVs/columns first, then keywords/functions; columns of query-referenced tables boosted), `prefixMatch(list, word)` case-insensitive filtering with a cap (e.g. 50 items) for popup performance

### Editor integration
- **Purpose:** Wire the hint engine into the CodeMirror query editor.
- **Type:** modification to existing files
- **File(s):** `src/renderer/app.js`, `src/renderer/index.html` (+ `styles/main.css` for popup theming if needed)
- **Pattern to follow:** existing editor setup in `app.js` (`CodeMirror.fromTextArea`, `extraKeys`); schema-cache/stale-response-guard discipline from 0003's resources tree
- **Key behavior:**
  - `index.html`: add the `addon/hint/show-hint.min.js` script tag (its CSS is already linked) **before** `app.js`
  - Schema cache: `state.schema` keyed by `activeCluster.url::activeDatabase`; fetched via `adxAPI.getSchema` on the same triggers as resources (cluster select → `loadDatabases`, `db-select` change, resources refresh button); stale responses discarded by key comparison (0003's guard pattern)
  - Custom hint function on `show-hint`: combines `buildCompletions` output; `.` after a resolvable table identifier scopes suggestions to that table's columns, otherwise all DB columns
  - Triggers: `Ctrl-Space` / `Cmd-Space` in `extraKeys`, plus auto-popup while typing an identifier (≥2 chars) and after `.`; suppressed inside comments/strings (CodeMirror token check); dismissed by Escape/click-away/cursor exit
  - Schema-fetch failures never block editing or querying: completion silently falls back to keywords/functions only (console-level visibility; no toast spam)

---

## Decision Tree

For each non-trivial decision point, document the options considered, the choice, and the rationale.

### Decision 1: Where does column schema come from?
- **Option A:** One `.show database schema as json` call per database, parsed into tables + MVs + columns.
  - Pros: single round-trip; proven parse pattern (`_showMaterializedViewsViaSchema`); works on clusters that reject per-resource commands (the observed SYN0002 cluster serves full schema JSON).
  - Cons: heavier payload on very large databases; column data unused by the sidebar.
- **Option B:** Per-resource `.show table <name> cslschema` fetched on demand.
  - Pros: smallest payloads; always-fresh data.
  - Cons: N sequential round-trips; more failure surface; the SYN0002 cluster proves some engines choke on such commands.
- **Option C:** Extend `getResources()` to return columns too.
  - Pros: one channel; no duplicate fetch for sidebar + editor.
  - Cons: couples sidebar rendering to editor needs; forces refactoring 0003's working renderer code and tests for no functional gain.
- **Chosen:** Option A (dedicated `getSchema()` + `kusto:get-schema` channel)
- **Reason:** One call, cluster-tolerant, zero changes to the working 0003 path; sidebar names and editor schema stay independently testable and committable.
- **Trade-off:** The schema JSON is fetched twice in practice (resources fetch + schema fetch) on selection; acceptable for v1 — folding both behind one channel is a future optimization.

### Decision 2: Which completion engine?
- **Option A:** CodeMirror 5 `sql-hint` addon with the SQL mode.
  - Pros: ready-made; roughly understands `table.column` syntax.
  - Cons: SQL-dialect keyword lists (no Kusto operators like `summarize`/`extend`); awkward wiring for Kusto tables/columns and bracket-quoted `["my-table"]` names.
- **Option B:** Custom hint function on the `show-hint` addon (its CSS is already loaded in the project).
  - Pros: full control over Kusto vocabulary, ranking, and triggers; list assembly lives in a pure, unit-testable module.
  - Cons: we own the keyword list and trigger logic.
- **Chosen:** Option B
- **Reason:** Kusto is not SQL; the curated vocabulary is small and static, and pure helpers can be tested without the DOM (the renderer has no automated UI tests — see 0002 Out of Scope).
- **Trade-off:** Maintaining the keyword/function list by hand; kept minimal-but-useful for v1.

### Decision 3: Which columns to suggest, and how are they scoped?
- **Option A:** Only columns of tables explicitly referenced in the query text.
  - Pros: precise suggestions.
  - Cons: needs reliable identifier detection without a parser; missed references starve suggestions.
- **Option B:** All columns of the selected database, always.
  - Pros: dead simple, never empty.
  - Cons: noisy on wide schemas; irrelevant columns rank alongside relevant ones.
- **Option C:** Hybrid — columns of query-referenced tables boosted/first, all DB columns as fallback; `.`-completion after a resolvable table identifier scopes to that table's columns.
- **Chosen:** Option C
- **Reason:** Best relevance with a best-effort (regex) reference scan; the fallback guarantees suggestions on fresh/blank queries.
- **Trade-off:** Occasional mis-scoping when the regex misses quoted/hyphenated identifiers — acceptable, self-correcting as the user types.

### Decision 4: When does the popup appear?
- **Option A:** Manual only (`Ctrl/⌘+Space`).
  - Pros: zero distraction; trivial to implement.
  - Cons: undiscoverable; users expect autosuggestion in modern editors.
- **Option B:** Automatic on every keystroke.
  - Pros: maximal convenience.
  - Cons: popup fatigue in comment/string contexts; performance cost on large schemas.
- **Option C:** Manual shortcut + auto-popup while typing an identifier (≥2 chars) and after `.`; suppressed inside comments/strings.
- **Chosen:** Option C
- **Reason:** Matches modern editor conventions (VS Code style) while keeping noise low; suppression in comments/strings is cheap via a CodeMirror token check.
- **Trade-off:** Slightly more state to manage (auto-trigger bookkeeping) than manual-only.

---

## Definition of Done (DoD)

- [x] Typing `Ctrl/⌘+Space` in the editor shows a completion popup with tables, materialized views, columns, keywords, and functions of the selected database
- [x] Typing an identifier auto-opens the popup; `.` after a table name offers that table's columns; suggestions filter by the typed prefix
- [x] Schema is fetched once per cluster/database and cached; switching cluster/database re-fetches; stale responses never populate the wrong schema
- [x] With no database selected, or on schema-fetch failure, editing/querying is unaffected and completion degrades to keywords/functions only — no crash, no toast spam
- [x] Unit tests written and passing: `getSchema` schema-JSON parsing (incl. the real deserializer + generator `rows()` pattern and defensive column-shape normalization), empty-db short-circuit, error propagation; `kusto-hints.js` pure helpers (identifier collection, prefix filtering, ranking/capping)
- [x] Integration tests written and passing: `kusto:get-schema` success/error envelope, device-code passthrough; channel registered in `ALL_CHANNELS`
- [x] No regressions in existing tests (97 unit/integration + E2E smoke green; E2E extended with an in-renderer KustoHints/showHint regression guard)
- [x] Code follows existing project conventions (CJS, injected deps, vanilla renderer JS, no bundler; UMD shim pattern for the new renderer module)
- [x] Relevant `decisions.md` entries added (schema-JSON source for completion; custom hint engine over `sql-hint`)
- [x] Docs updated (README features list; spec → DONE after verification)

> **Verification note:** manual verification against a real cluster surfaced two bugs, both fixed during verification —
> missing `kusto-hints.js` script tag (8a5c780, popup never appeared; E2E regression guard added) and cross-resource
> column suggestions causing SEM0100 (a96b78a: case-insensitive resource resolution + referenced-resource-only column
> scoping). All 6 spec scenarios + spot-checks verified passing. Scenario 6 (silent degradation) verified by unit test
> (`keeps working with no schema at all`) plus console-warn fallback path.

---

## Test Scenarios

1. **Keyword completion on a blank query**
   - **Given:** A cluster is connected but no database is selected (or schema fetch failed)
   - **When:** The user types `sum` and presses `Ctrl/⌘+Space`
   - **Then:** Kusto keywords/functions (`summarize`, `sum(...)`, …) are suggested — no crash, no error UI

2. **Table and MV completion**
   - **Given:** A database with tables `StormEvents` and materialized view `MicroWeatherView` is selected and its schema cached
   - **When:** The user types `Storm`
   - **Then:** The popup suggests `StormEvents` (and any matching resource) above generic keywords

3. **Column completion with `.`**
   - **Given:** The query contains `StormEvents`
   - **When:** The user types `StormEvents.` then a prefix like `Eve`
   - **Then:** Only `StormEvents`' columns matching the prefix (e.g. `EventId`, `EventType`) are suggested

4. **Column fallback on a fresh query**
   - **Given:** A cached schema exists but the query references no tables yet
   - **When:** The user triggers completion on an identifier
   - **Then:** Columns from all database tables are suggested (after tables/MVs), capped at the popup limit

5. **Database switch invalidates schema**
   - **Given:** Completion is populated for database A's schema
   - **When:** The user selects database B while a slow response from A is still in flight
   - **Then:** Completions reflect only B's schema (stale-response guard); keywords remain available meanwhile

6. **Schema failure degradation**
   - **Given:** The cluster rejects `.show database schema as json` (e.g. auth expired)
   - **When:** The user types a keyword prefix and triggers completion
   - **Then:** Keyword/function suggestions still appear; querying is unaffected; no repeated toasts

---

## Out of Scope

- Hover documentation, signature help, and inline docs for functions (future enhancement)
- KQL syntax validation/linting, error underlining, or query formatting
- Stored functions, external tables, and cross-cluster/database completion
- Server-driven completion beyond the cached schema JSON (e.g. per-keystroke mgmt calls)
- A full Kusto parser for context detection — best-effort regex identifier scanning only
- Automated renderer DOM tests for the popup itself (renderer has no test harness; verified manually per project convention)

---

## Notes

- Reuses the per-cluster client cache; device-code messages flow through the same `auth:device-code-message` relay as all `kusto:*` handlers
- `show-hint` CSS is already linked in `index.html` (added with the original editor setup) — only the JS addon script is missing
- Schema-JSON parsing must iterate `rows()` with `for..of` (it is a generator, not indexable) — the exact bug class pinned by 0003 bugfix #3 (`f9b63f6`); reuse the generator-based mock + real `KustoResponseDataSetV1` deserializer test pattern from `tests/unit/kusto-client.test.js`
- Consider folding the sidebar's resources fetch and this schema fetch into one channel as a follow-up (see Decision 1 trade-off)
- Azure support ticket for the ANOVEDA PROD SYN0002 anomaly remains recommended (see `current-state.md` Known Issues)