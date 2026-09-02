# Spec: Kustodesk - inital version

> **Status:** DONE  <!-- DRAFT → APPROVED → IN PROGRESS → DONE -->
> **Created:** <2026-05-18>
> **Owner:** @gpasnik

---

## Goal

Build a cross-platform **Electron** desktop application that connects to one or more Azure Data Explorer (Kusto) clusters using **Azure Entra ID authentication via the Azure CLI credential**. Users can write Kusto queries in a rich editor and view results in a clean, readable table format.

The app uses `AzureCliCredential` from `@azure/identity` — the same credential the Azure CLI uses — so if the user is already logged in via `az login`, the app will work without any additional browser-based auth steps. A fallback **Device Code** flow is also supported for cases where CLI auth isn't available.

The browser-based Azure Data Explorer UI can be blocked by corporate network policies or SSO configurations. Kustodesk runs as a native desktop app and authenticates using the same mechanisms that work in your terminal — including your existing `az login` session — bypassing any browser-based restrictions entirely.


## High-Level Behavior

- **Multi-cluster support** — add, edit, and switch between any number of ADX clusters
- **Three authentication modes** — Azure CLI, Device Code, and App Registration
- **Kusto query editor** — CodeMirror-powered editor with syntax highlighting, line numbers, and `Ctrl/⌘+Enter` to run
- **Results table** — sortable columns, type-aware cell formatting, renders up to 5,000 rows
- **JSON view** — toggle between table and raw JSON output
- **CSV export** — export any result set to a `.csv` file via native file dialog
- **Query history** — per-cluster history of recent queries with row count and execution time
- **Dark mode UI** — built for long query sessions

## Background / Motivation

To workaround networking issues with Azure Data Explorer Web UI.

---

## Components

### Electron Main Process
- **Purpose:** App lifecycle, `BrowserWindow` creation, and the IPC surface between renderer and main process (cluster CRUD, query execution, history, CSV export).
- **Type:** new file
- **File(s):** `src/main/main.js`
- **Pattern to follow:** Vanilla Node/CommonJS Electron main process — one `ipcMain.handle` per IPC channel, thin handlers delegating to `KustoClientManager` and `Store`.
- **Key behavior:**
  - Window: 1440×900 (min 1000×700), `hiddenInset` title bar on macOS, dark background, `contextIsolation: true`, `nodeIntegration: false`
  - **macOS/Linux PATH fix:** prepends `/opt/homebrew/bin`, `/usr/local/bin`, etc. so `az` is found when the app is launched from Finder/Dock (not from a shell)
  - IPC channels: `clusters:get-all|add|update|delete`, `kusto:execute`, `kusto:test-connection`, `kusto:get-databases`, `history:get|clear`, `export:csv`
  - `kusto:execute` measures wall-clock execution time, records a history entry (query, database, row count, time), and touches the cluster's `lastUsedAt`
  - Deleting a cluster invalidates its cached Kusto client before removing it from the store
  - CSV export via native save dialog: values quoted with `""` escaping, objects serialized as JSON, `null`/`undefined` → empty cell
  - Device Code login messages relayed to the renderer via the `auth:device-code-message` event

### Kusto Client & Authentication Manager
- **Purpose:** Builds authenticated Kusto clients per auth method, caches them, and executes queries / management commands against ADX.
- **Type:** new file
- **File(s):** `src/main/kusto-client.js`
- **Pattern to follow:** `azure-kusto-data` v6 API (`Client`, `KustoConnectionStringBuilder`, `rows()` iterator, `executeMgmt` for `.show` commands).
- **Key behavior:**
  - **Azure CLI auth:** calls `az account get-access-token --resource https://kusto.kusto.windows.net` directly via `withTokenProvider` (per-request callback handles token refresh); optional `--tenant` scoping
  - **Device Code auth:** `withAadDeviceAuthentication` with optional tenant; login message streamed to the renderer banner
  - **App Registration auth:** `withAadApplicationKeyAuthentication` (tenant ID + client ID + client secret)
  - Client cache keyed `url::authMethod(:tenantId:clientId)`; **device-code clients are never cached** (fresh callback each attempt); `invalidate()` on cluster delete
  - `execute()`: reads `primaryResults[0]`, returns `{ columns (name + columnType), rows (via rows()/toJSON()), rowCount }`
  - `getDatabases()` runs `.show databases` as a management command (`executeMgmt`); `testConnection()` delegates to it

### Persistent Store
- **Purpose:** Durable storage for cluster configurations and query history — no external store dependency.
- **Type:** new file
- **File(s):** `src/main/store.js`
- **Pattern to follow:** Plain JSON files read/written with `fs` inside Electron's `userData` path.
- **Key behavior:**
  - Files: `clusters.json`, `history.json` (created on first launch under `~/Library/Application Support/Kustodesk/` on macOS, equivalent on Win/Linux)
  - Cluster CRUD with UUIDs, `createdAt` / `lastUsedAt` timestamps
  - Deleting a cluster also removes its history entries
  - History capped at 200 entries (newest first, `unshift` + `slice`)

### Preload Bridge
- **Purpose:** Secure, typed API surface exposed to the renderer — the only channel between UI and main process.
- **Type:** new file
- **File(s):** `src/main/preload.js`
- **Pattern to follow:** `contextBridge.exposeInMainWorld('adxAPI', …)` + `ipcRenderer.invoke` per channel.
- **Key behavior:**
  - Namespaced methods: clusters (`getClusters/addCluster/updateCluster/deleteCluster`), Kusto (`executeQuery/testConnection/getDatabases`), history (`getHistory/clearHistory`), export (`exportCsv`)
  - `onDeviceCodeMessage` / `offDeviceCodeMessage` for main→renderer auth events

### Renderer UI
- **Purpose:** The whole application shell — sidebar, editor, results, cluster/auth modal, status bar.
- **Type:** new file
- **File(s):** `src/renderer/index.html`, `src/renderer/app.js`, `src/renderer/styles/main.css`
- **Pattern to follow:** No framework — vanilla JS with a single `state` object, `$()` DOM-ref map, delegated event listeners, HTML-escaping helper (`esc()`).
- **Key behavior:**
  - CodeMirror 5 editor (CDN) in SQL mode: line numbers, bracket matching, `Ctrl/⌘+Enter` run, `Ctrl/⌘+/` toggle comment, resizable editor pane (drag handle)
  - Cluster modal: name/URL, three auth tabs (CLI / Device Code / App Registration) with per-mode fields, validation, **Test Connection** button
  - Sidebar: cluster list (click to select, edit/delete buttons) + per-cluster query history (click to reload into editor, clear button)
  - Results panel: sortable table (type-aware cell classes for null/number/bool/datetime/object), JSON tab, copy-as-JSON, CSV export, row count + execution time status
  - Device Code banner showing the login code/URL; toast notifications; connection status dot; auto-selects the most recently used cluster on startup

### Packaging & Distribution
- **Purpose:** Build and release cross-platform distributables.
- **Type:** new file | config change
- **File(s):** `package.json`, `.github/workflows/release.yml`
- **Pattern to follow:** `electron-builder` config in `package.json`; GitHub Actions release workflow.
- **Key behavior:**
  - Targets: macOS `.dmg`, Windows NSIS installer, Linux AppImage; output in `dist/`
  - Scripts: `build:mac`, `build:mac:universal`, `build:win`, `build:linux`

---

## Decision Tree

For each non-trivial decision point, document the options considered, the choice, and the rationale.

### Decision 1: How should Azure CLI authentication be implemented?
- **Option A:** `@azure/identity` `AzureCliCredential` via `KustoConnectionStringBuilder.withAzLoginIdentity()`
  - Pros: Pure-library auth, no shell dependency; aligns with the original design (`implementation_plan.md`)
  - Cons: Misbehaves inside Electron — wrong resource scope, PATH resolution issues, tenant resolution problems
- **Option B:** Shell out to `az account get-access-token --resource https://kusto.kusto.windows.net` via `withTokenProvider()` callback
  - Pros: Behaves *exactly* like the terminal (same token, same tenant logic); token refresh handled by per-request callback; optional `--tenant` flag
  - Cons: Requires `az` on PATH; spawns a child process per token acquisition
- **Chosen:** Option B
- **Reason:** The whole point of the app is that auth works "the way your terminal works." Empirically `@azure/identity` failed inside Electron (documented in `kusto-client.js` comments); the direct CLI call is the reliable path.
- **Trade-off:** Depends on the Azure CLI being installed and discoverable — mitigated by prepending common Homebrew locations to `PATH` in `main.js`.

### Decision 2: How should cluster configs and history be persisted?
- **Option A:** `electron-store`
  - Pros: Schema support, atomic writes, migration helpers
  - Cons: Extra dependency for only two small datasets
- **Option B:** Plain JSON files (`clusters.json`, `history.json`) via `fs` in `userData`
  - Pros: Zero dependencies, human-inspectable, trivially simple (~100 lines)
  - Cons: No schema validation; client secrets stored in plain text
- **Chosen:** Option B
- **Reason:** Only two datasets with simple shapes; the store is the least complex part of the app.
- **Trade-off:** No encryption — acceptable for a developer tool; secret encryption via `safeStorage` is a known follow-up (see Out of Scope).

### Decision 3: Which code editor component for the query editor?
- **Option A:** Monaco Editor
  - Pros: Full IDE-grade features (VS Code engine), rich language service model
  - Cons: Heavy (~MBs), bundling complexity in a no-bundler Electron app, overkill for query execution
- **Option B:** CodeMirror 5 via CDN
  - Pros: Lightweight, SQL mode + comment/hint/placeholder addons, zero build step (script tags in `index.html`)
  - Cons: CDN dependency (needs network on first run); no Kusto-specific IntelliSense
- **Chosen:** Option B
- **Reason:** Kusto is close enough to SQL for highlighting purposes; the app values simplicity over IDE features.
- **Trade-off:** No offline guarantee and no context-aware completions — acceptable for v1.

### Decision 4: Should Kusto client instances be cached?
- **Option A:** Recreate the client on every request
  - Pros: Always-fresh credentials; simplest correctness model
  - Cons: Re-authentication overhead per query
- **Option B:** Cache clients keyed by `url::authMethod(:tenantId:clientId)`, never cache device-code clients, `invalidate()` on cluster delete/update
  - Pros: Reuses authenticated connections for repeated queries; still correct when credentials change
  - Cons: Revoked credentials remain valid until a cache invalidation happens
- **Chosen:** Option B
- **Reason:** Query sessions hit the same cluster repeatedly; caching avoids per-query auth cost. Device-code clients are excluded because the interactive flow must not be reused across attempts.
- **Trade-off:** Slight staleness window for credential revocation, bounded by cluster edit/delete (which invalidates).

---

## Definition of Done (DoD)

- [x] Multi-cluster CRUD (add / edit / delete / switch) with per-cluster auth configuration
- [x] Three authentication modes working: Azure CLI (direct `az account get-access-token`), Device Code (in-app banner with code + URL), App Registration (client credentials)
- [x] Connection test and database listing (`.show databases`) per cluster
- [x] CodeMirror query editor: syntax highlighting, line numbers, `Ctrl/⌘+Enter` to run, `Ctrl/⌘+/` to comment
- [x] Results: sortable columns, type-aware cell formatting, up to 5,000 rows rendered; JSON view; copy-as-JSON
- [x] CSV export via native save dialog with correct quoting/escaping
- [x] Per-cluster query history: click-to-reload, clear button, 200-entry cap, row count + execution time recorded
- [x] Dark-mode UI; most recently used cluster auto-selected on startup
- [x] Packaging for macOS (.dmg), Windows (NSIS), Linux (AppImage) + GitHub Actions release workflow
- [x] No regressions in existing tests *(n/a — no test suite exists in this repo yet)*
- [x] Code follows project conventions (vanilla Node/CommonJS, no bundler, no framework, single-responsibility modules)
- [ ] **Deferred → `0002`:** Test infrastructure + unit tests for main-process modules (`kusto-client.js` — KCSB building & cache keying; `store.js` — CRUD & history trimming; CSV escaping)
- [ ] **Deferred → `0002`:** Integration tests for IPC handlers (`clusters:*`, `kusto:*`, `history:*`, `export:csv`)
- [ ] **Deferred → `0002`:** E2E smoke test of the packaged app (launch → auth → query → export)

> **Note:** Automated testing was deliberately deferred to the next feature (`0002`), which will introduce a test runner (e.g. Vitest/Jest), CI integration, and the scenarios listed below as the initial test cases. All v1 verification was manual.

---

## Test Scenarios

1. **Add a cluster with Azure CLI auth**
   - **Given:** The user is logged in via `az login` and no clusters exist
   - **When:** They click **+ Add Cluster**, enter name + URL, pick the **Azure CLI** tab, click **Test Connection**, then **Save**
   - **Then:** Connection succeeds, the cluster appears in the sidebar, and its databases are loaded on selection

2. **Run a query and inspect results**
   - **Given:** A cluster is selected and a database chosen
   - **When:** The user types a KQL query and presses `⌘/Ctrl+Enter`
   - **Then:** Results render in a sortable, type-styled table with row count and execution time in the status bar; a history entry is recorded

3. **Sort and export results**
   - **Given:** A result set is displayed
   - **When:** The user clicks a column header, then clicks **Export CSV** and picks a destination
   - **Then:** The table re-sorts by that column (toggle asc/desc) and a correctly-quoted `.csv` file is written

4. **Device Code authentication**
   - **Given:** `az login` is unavailable and the user picks the **Device Code** tab
   - **When:** They test the connection or run a query
   - **Then:** A banner shows the device code / login URL and the app proceeds once authentication completes in the browser

5. **App Registration authentication**
   - **Given:** The user has tenant ID, client ID, and client secret
   - **When:** They fill the **App Registration** tab and save
   - **Then:** Queries authenticate as the service principal; a missing field is caught by modal validation

6. **Query history**
   - **Given:** Several queries have been run on the active cluster
   - **When:** The user clicks a history item, then clicks the clear-history button and confirms
   - **Then:** The query is restored into the editor; after clearing, the history list is empty (only for that cluster)

7. **PATH fix for Finder launch (macOS)**
   - **Given:** The app is launched from Finder/Dock (no shell `PATH` inheritance) with Azure CLI installed via Homebrew
   - **When:** A query runs using Azure CLI auth
   - **Then:** Token acquisition succeeds because `/opt/homebrew/bin` (etc.) was prepended to `PATH` at startup

---

## Out of Scope

- Service-principal auth via certificates or connection strings (only client-secret app registrations are supported)
- Schema/table browsing, Kusto IntelliSense, or query autocompletion
- Charts / result visualizations (table + JSON + CSV only)
- Multi-tab query sessions or multiple simultaneous editors
- Encryption of stored client secrets — currently plain text in `clusters.json` (known debt; `safeStorage` follow-up candidate)
- Auto-update / code signing / notarization
- Non-CLI auth beyond the three supported modes (e.g. interactive MSAL browser pop-up)

---

## Notes

- **Dependencies:** `azure-kusto-data@^6` (Kusto client — v6 `rows()`/`executeMgmt` API), `@azure/identity`, `uuid`; dev: `electron@^31`, `electron-builder@^24`
- **Follow-ups deferred to `0002`:** automated testing (unit / IPC integration / packaged E2E) — see deferred DoD items and the Test Scenarios above, which serve as the initial test-case list
- **Known debt:** client secrets stored in plain text in `clusters.json`; consider `safeStorage` encryption in a future spec
- References: `README.md` (user-facing docs incl. auth modes and data-storage locations), `implementation_plan.md` (original planning artifact — note it predates the auth-implementation decision above)