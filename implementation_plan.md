# ADX Desktop Client — Implementation Plan

## Overview

Build a cross-platform **Electron** desktop application that connects to one or more Azure Data Explorer (Kusto) clusters using **Azure Entra ID authentication via the Azure CLI credential**. Users can write Kusto queries in a rich editor and view results in a clean, readable table format.

The app uses `AzureCliCredential` from `@azure/identity` — the same credential the Azure CLI uses — so if the user is already logged in via `az login`, the app will work without any additional browser-based auth steps. A fallback **Device Code** flow is also supported for cases where CLI auth isn't available.

---

## User Review Required

> [!IMPORTANT]
> **Authentication Strategy**: The primary auth method will be `AzureCliCredential` (uses your existing `az login` session). This is why terminal access works. A `DeviceCodeCredential` fallback will also be offered. If you have a specific **App Registration** (Client ID / Tenant ID) you'd like to use instead for interactive browser auth, please share those details.

> [!IMPORTANT]
> **App Registration**: For `DeviceCodeCredential` or interactive MSAL auth, an Entra ID app registration is needed (with `https://management.azure.com/` and `https://help.kusto.windows.net/.default` permissions). If you don't have one, we'll use Azure CLI credential only (no app reg needed).

---

## Open Questions

1. **Auth preference**: Should the app default to Azure CLI credential (requires `az login` first), or do you want an interactive login button with device code / browser pop-up?
2. **Result format**: Should results be shown as a table, JSON, CSV export — or all three with a toggle?
3. **Query history**: Should the app remember previously run queries per cluster?
4. **macOS-only or cross-platform?** (Affects packaging approach)

---

## Proposed Changes

### Project Foundation

#### [NEW] `package.json`
Electron app definition with all dependencies:
- `electron` — desktop shell
- `azure-kusto-data` — Kusto/ADX client
- `@azure/identity` — `AzureCliCredential`, `DeviceCodeCredential`, `ChainedTokenCredential`
- `electron-store` — persistent storage for cluster configs and query history

#### [NEW] `electron-builder.yml`
macOS packaging config (`.dmg` output).

---

### Main Process (Node.js / Electron Main)

#### [NEW] `src/main/main.js`
- Creates the `BrowserWindow`
- Registers `ipcMain` handlers:
  - `kusto:query` — executes a Kusto query against a cluster URL, returns rows + columns
  - `kusto:test-connection` — verifies connectivity and auth to a given cluster
  - `kusto:auth-status` — checks if Azure CLI credential is working
  - `clusters:save` / `clusters:load` / `clusters:delete` — CRUD for saved cluster list
  - `history:save` / `history:load` — query history per cluster

#### [NEW] `src/main/kusto-client.js`
- Manages a pool of `KustoClient` instances (one per cluster URL)
- Auth chain: `ChainedTokenCredential([AzureCliCredential, DeviceCodeCredential])`
- Uses `KustoConnectionStringBuilder.withAzureTokenCredential(url, credential)`
- Returns structured `{ columns, rows, executionTime, error }` results

#### [NEW] `src/main/store.js`
- Wraps `electron-store` for typed access to:
  - `clusters[]` — `{ id, name, url, lastUsed }`
  - `queryHistory[]` — `{ clusterId, query, timestamp }`
  - `settings` — theme, default database, etc.

---

### Renderer Process (UI)

#### [NEW] `src/renderer/index.html`
Main window shell.

#### [NEW] `src/renderer/styles/main.css`
Design system:
- Dark mode default with deep navy/slate palette
- Glassmorphism panels
- Monospace font for query editor (JetBrains Mono via Google Fonts)
- Inter for UI text
- Smooth transitions and hover effects

#### [NEW] `src/renderer/app.js`
Main UI controller managing:
- **Sidebar**: cluster list with add/edit/delete and active cluster indicator
- **Query editor**: syntax-highlighted textarea (CodeMirror or Monaco-lite) with `Ctrl+Enter` to run
- **Results panel**: tabbed view — Table / JSON / Raw
- **Status bar**: connection status, row count, execution time, auth method indicator

#### [NEW] `src/renderer/components/cluster-manager.js`
Modal to add/edit cluster entries: name + URL + optional default database.

#### [NEW] `src/renderer/components/results-table.js`
Virtual-scroll table for large result sets with column sorting and copy-to-clipboard.

#### [NEW] `src/renderer/components/query-editor.js`
CodeMirror 6 editor with:
- Kusto keyword highlighting
- Line numbers
- `Ctrl+Enter` shortcut

---

### App UI Layout

```
┌──────────────────────────────────────────────────────┐
│  ADX Reader                               [─][□][×]  │
├────────────┬─────────────────────────────────────────┤
│  Clusters  │  Database: [_________▼]                 │
│  ──────    │  ┌─────────────────────────────────┐   │
│  ● Prod    │  │  // Kusto Query Editor           │   │
│    Dev     │  │  StormEvents | take 100          │   │
│    Staging │  │                                  │   │
│  [+ Add]   │  └─────────────────────────────────┘   │
│            │  [▶ Run Query]  [⎘ Copy]  [⤓ Export]   │
│            ├─────────────────────────────────────────┤
│  History   │  Results: [Table] [JSON] [CSV]          │
│  ──────    │  ┌─────────────────────────────────┐   │
│  take 100  │  │ Col1   │ Col2   │ Col3          │   │
│  summarize │  │────────┼────────┼────────       │   │
│            │  │ val1   │ val2   │ val3          │   │
│            │  └─────────────────────────────────┘   │
│            │  ✓ 100 rows  •  42ms  •  Azure CLI     │
└────────────┴─────────────────────────────────────────┘
```

---

## Verification Plan

### Automated
- `npm start` — launches Electron window without errors
- Connection test button returns success/failure status clearly

### Manual Verification
- Log in via `az login` then launch app — cluster connects without prompting for credentials
- Run `StormEvents | take 10` — results display in table
- Add a second cluster URL — switch between them seamlessly
- Close and reopen app — cluster list persists

### Packaging
- `npm run build` — produces `.dmg` installer for macOS
