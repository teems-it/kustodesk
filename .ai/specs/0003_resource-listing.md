# Spec: Resource Listing

> **Status:** DRAFT  <!-- DRAFT → APPROVED → IN PROGRESS → DONE -->
> **Created:** 2026-09-02
> **Owner:** @gpasnik

---

## Goal

Show all available tables and materialized views of the selected database in a sidebar tree, with a right-click action to insert a "take 100" starter query for any resource.

## High-Level Behavior

When a cluster is selected and a database chosen, a tree appears in the sidebar close to the cluster list, grouped into **Tables** and **Materialized Views**. Right-clicking a table or materialized view opens a context menu with "Query 100 rows", which inserts `["ResourceName"] | take 100` into the query editor, ready to run. The tree refreshes on database change and via a refresh button.

## Background / Motivation

Currently users must remember all table names — this feature would make querying the data much easier. `.show databases` support already exists (v1); this extends the same pattern to database-level resources. It is also the natural precursor to 0004 (Kusto IntelliSense), which could reuse the resource list.

---

## Components

### Resource fetcher (`KustoClientManager.getResources`)
- **Purpose:** Fetch the tables and materialized views of a database via management commands.
- **Type:** modification to existing file
- **File(s):** `src/main/kusto-client.js`
- **Pattern to follow:** `getDatabases()` — executeMgmt + `rows()`/`toJSON()` iteration, client cache reuse
- **Key behavior:**
  - `getResources(url, database, authMethod, authConfig, onDeviceCodeMessage)` → `{ tables: string[], materializedViews: string[] }`
  - Uses database-scoped mgmt commands: `executeMgmt(database, '.show tables')` (map `TableName`) and `executeMgmt(database, '.show materialized views')` (map `Name`)
  - Reuses the existing per-cluster client cache; empty database → both lists empty without any mgmt call

### IPC channel
- **Purpose:** Expose resource listing to the renderer.
- **Type:** modification to existing files
- **File(s):** `src/main/ipc-handlers.js`, `src/main/preload.js`
- **Pattern to follow:** `kusto:get-databases` handler — success/error envelope, device-code callback via `makeDeviceCodeCallback`
- **Key behavior:**
  - `kusto:get-resources` with `{ url, database, authMethod, authConfig }` → `{ success, resources: { tables, materializedViews } }` or `{ success: false, error }`
  - Preload: `adxAPI.getResources(params)` exposed on `contextBridge`

### Sidebar tree UI
- **Purpose:** Browse the resources of the selected database.
- **Type:** modification to existing files
- **File(s):** `src/renderer/index.html`, `src/renderer/app.js` (+ `styles/main.css` for tree styling)
- **Pattern to follow:** existing sidebar sections (Clusters / History) — header with icon button, delegated click handling, `esc()` escaping
- **Key behavior:**
  - New "Resources" sidebar section between Clusters and History, with a refresh icon button in the section header
  - Tree: root = active database; two collapsible groups — **Tables** (table icon) and **Materialized Views** (view icon); items show the plain resource name
  - Fetch triggers: after `loadDatabases` succeeds on cluster select, on `db-select` change, and on refresh button click
  - Stale-response guard: tag each request with the cluster/database it was made for; discard responses that no longer match the current selection
  - States: loading (spinner/text), error (inline message + toast), no database selected ("— select database —"), empty lists ("No tables" / "No materialized views")


---

## Decision Tree

For each non-trivial decision point, document the options considered, the choice, and the rationale.

### Decision 1: How to fetch resources?
- **Option A:** Dedicated mgmt commands (`.show tables`, `.show materialized views`) per list
  - Pros: simple, small payloads, stable output columns; matches the existing `getDatabases` pattern
- **Option B:** `.show database [name] schema` (full schema JSON)
  - Pros: single call; includes columns/types — useful for IntelliSense later
  - Cons: heavy payload, complex parsing, overkill for a name list
- **Chosen:** Option A
- **Reason:** Minimal change consistent with v1's mgmt-command approach; the schema approach can be layered on later for 0004 (IntelliSense).
- **Trade-off:** Two mgmt calls per refresh instead of one.

### Decision 2: One combined IPC call vs two separate channels?
- **Option A:** Combined `kusto:get-resources` returning `{ tables, materializedViews }`
  - Pros: one round trip, atomic tree refresh, fewer channels to register/test
- **Option B:** Separate `kusto:get-tables` / `kusto:get-materialized-views`
  - Pros: independent failure and caching per list
- **Chosen:** Option A
- **Reason:** The tree always renders both groups together; simplicity wins.
- **Trade-off:** A failure in one mgmt call fails the whole refresh — acceptable since the refresh button retries.

### Decision 3: Tree placement & structure
- **Option A:** New sidebar "Resources" section bound to the active cluster/database
  - Pros: matches the request ("somewhere close to the cluster selection"); follows the existing sidebar-section pattern
- **Option B:** Expandable resource tree under each cluster item
  - Cons: duplicate mgmt calls per cluster, deeper nesting, auth noise
- **Chosen:** Option A
- **Trade-off:** Tree content changes wholesale on cluster/database switch (mitigated by the stale-response guard).

### Decision 4: Context menu implementation
- **Option A:** Custom DOM menu in the renderer
  - Pros: dark-theme styling consistent with the UI; no main-process coupling
  - Cons: manual positioning/dismissal logic
- **Option B:** Electron native `Menu.popup()`
  - Pros: OS-native behavior for free
  - Cons: cannot be styled to match the dark UI; needs a main-process round trip per invocation
- **Chosen:** Option A
- **Trade-off:** A little positioning/edge-case code in the renderer.

### Decision 5: Inserted query form
- **Option A:** Always bracket-quoted: `["ResourceName"] | take 100`
  - Pros: safe for names with spaces, special characters, or reserved words
- **Option B:** Bare name when simple: `ResourceName | take 100`
  - Pros: prettier for the common case
  - Cons: requires name-safety heuristics; breaks on edge cases
- **Chosen:** Option A
- **Reason:** Correctness over aesthetics; consistent output is also easier to test.
- **Trade-off:** Slightly noisier query for simple names.

---

## Definition of Done (DoD)

- [ ] Sidebar tree shows tables and materialized views of the selected database; updates on cluster select, database change, and refresh click
- [ ] Right-click "Query 100 rows" inserts a runnable `["Name"] | take 100` query (verified manually against a real cluster)
- [ ] Loading / error / empty states handled; stale responses cannot clobber the current tree
- [ ] Unit tests written and passing: `getResources` mgmt commands, row mapping, empty-database short-circuit, error propagation
- [ ] Integration tests written and passing: `kusto:get-resources` success/error envelope, device-code passthrough
- [ ] No regressions in existing tests (49 unit/integration tests + E2E smoke stay green)
- [ ] Code follows existing project conventions (CJS, injected deps, vanilla renderer JS)
- [ ] Relevant `decisions.md` entries added (mgmt-command choice, combined channel, context menu)
- [ ] Docs updated (README features list)

---

## Test Scenarios

1. **Tree population**
   - **Given:** A selected cluster and database containing tables and materialized views
   - **When:** The tree loads
   - **Then:** "Tables" and "Materialized Views" groups render with the correct resource names

2. **Database switch**
   - **Given:** The tree is populated for database A
   - **When:** The user selects database B
   - **Then:** The tree re-fetches and shows B's resources

3. **Query 100 rows**
   - **Given:** The tree is populated
   - **When:** The user right-clicks a table and picks "Query 100 rows"
   - **Then:** The editor contains `["ThatTable"] | take 100`, runnable with ⌘/Ctrl+Enter

4. **Insert with existing query**
   - **Given:** The editor already contains a query
   - **When:** "Query 100 rows" is used
   - **Then:** The starter query is inserted at the cursor without destroying surrounding text

5. **Empty database / auth failure**
   - **Given:** No database is selected, or authentication has expired
   - **When:** The tree tries to load
   - **Then:** An empty-state message is shown (or the error envelope surfaces via toast) — no crash

6. **Stale response guard**
   - **Given:** A slow resources response is in flight
   - **When:** The user switches to another database
   - **Then:** The tree shows the newly selected database's resources, never the stale ones

---

## Out of Scope

- Other ADX resources: functions, external tables, dashboards (future enhancement)
- Column/schema display in the tree (candidate for 0004 — Kusto IntelliSense)
- Single-click auto-run of the take-100 query — only insertion
- Search/filter box in the tree; drag-and-drop of resource names

---

## Notes

- Reuses the existing per-cluster client cache; device-code messages flow through the same `auth:device-code-message` relay
- Test scenarios 5–6 mirror the error-envelope and race patterns already pinned by 0002's tests
- Renderer behavior (tree, context menu) is verified manually per project convention — renderer code has no automated tests (see 0002 Out of Scope)

</task_progress>
</write_to_file>