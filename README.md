# Kustodesk

> A desktop client for Azure Data Explorer — built for developers who need fast, authenticated Kusto query access without the browser.

![Electron](https://img.shields.io/badge/Electron-31-47848F?style=flat&logo=electron&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=white)
![Azure](https://img.shields.io/badge/Azure-Data%20Explorer-0078D4?style=flat&logo=microsoftazure&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat)
![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat)

---

## Why Kustodesk?

The browser-based Azure Data Explorer UI can be blocked by corporate network policies or SSO configurations. Kustodesk runs as a native desktop app and authenticates using the same mechanisms that work in your terminal — including your existing `az login` session — bypassing any browser-based restrictions entirely.

---

## Features

- **Multi-cluster support** — add, edit, and switch between any number of ADX clusters
- **Three authentication modes** — Azure CLI, Device Code, and App Registration
- **Kusto query editor** — CodeMirror-powered editor with syntax highlighting, line numbers, and `Ctrl/⌘+Enter` to run
- **Results table** — sortable columns, type-aware cell formatting, renders up to 5,000 rows
- **JSON view** — toggle between table and raw JSON output
- **CSV export** — export any result set to a `.csv` file via native file dialog
- **Query history** — per-cluster history of recent queries with row count and execution time
- **Dark mode UI** — built for long query sessions

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (required for Azure CLI auth mode)
- Access to an Azure Data Explorer cluster

---

## Installation

```bash
# Clone the repository
git clone https://github.com/teems-labs/kustodesk.git
cd kustodesk

# Install dependencies
npm install

# Launch the app
npm start
```

---

## Authentication

Kustodesk supports three authentication methods, configurable per cluster.

### 1. Azure CLI *(recommended)*

Uses your existing `az login` session — no additional configuration needed.

```bash
# Log in once in your terminal
az login
```

Then launch Kustodesk and select **Azure CLI** when adding a cluster. The app calls `az account get-access-token --resource https://kusto.kusto.windows.net` directly, so it works exactly like your terminal does.

**Optional:** If you're a guest user in multiple tenants, enter your target **Tenant ID** in the Azure CLI auth panel to scope the token correctly.

### 2. Device Code

Triggers an interactive login flow without opening a browser window inside the app. Kustodesk displays the device code and login URL — open any browser, go to `https://microsoft.com/devicelogin`, enter the code, and authenticate.

Optional fields:
- **Tenant ID** — restricts authentication to a specific tenant
- **Client ID** — your own app registration (leave blank to use the default)

### 3. App Registration

Authenticates as a service principal using client credentials. Requires:

| Field | Description |
|---|---|
| **Tenant ID** | Directory (tenant) ID of your Entra app |
| **Client ID** | Application (client) ID |
| **Client Secret** | A valid client secret for the app |

The service principal must have at least **Viewer** role on the target ADX cluster or database.

---

## Usage

### Adding a cluster

1. Click **+ Add Cluster** in the top-right of the header
2. Enter a display name and the cluster URL (e.g. `https://mycluster.westeurope.kusto.windows.net`)
3. Optionally set a default database
4. Choose your authentication method and fill in any required fields
5. Click **Test Connection** to verify — then **Save**

### Running a query

1. Select a cluster from the left sidebar (it will connect and load databases automatically)
2. Choose a database from the dropdown in the toolbar
3. Write your Kusto query in the editor
4. Press `Ctrl+Enter` (Windows/Linux) or `⌘+Enter` (macOS) — or click **Run Query**

### Viewing results

Results appear in the panel below the editor:

- **Table** tab — sortable, type-colored result table. Click any column header to sort.
- **JSON** tab — raw JSON array of result rows
- **Export CSV** — saves the current result set as a `.csv` file

### Query history

The left sidebar shows recent queries for the active cluster. Click any history item to load it back into the editor.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` / `⌘+Enter` | Run query |
| `Ctrl+/` / `⌘+/` | Toggle comment on selected lines |

---

## Building for distribution

```bash
# macOS (.dmg)
npm run build:mac

# Windows (.exe installer)
npm run build:win

# Linux (.AppImage)
npm run build:linux

# All platforms
npm run build
```

Output is placed in the `dist/` directory.

---

## Project structure

```
kustodesk/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main process & IPC handlers
│   │   ├── preload.js       # Secure context bridge to renderer
│   │   ├── kusto-client.js  # ADX client & authentication logic
│   │   └── store.js         # Persistent JSON storage (clusters, history)
│   └── renderer/
│       ├── index.html       # Application shell
│       ├── app.js           # UI controller
│       └── styles/
│           └── main.css     # Design system & dark theme
├── package.json
└── README.md
```

---

## Data storage

Cluster configurations and query history are stored as JSON files in your OS user data directory:

| OS | Location |
|---|---|
| macOS | `~/Library/Application Support/kustodesk/` |
| Windows | `%APPDATA%\kustodesk\` |
| Linux | `~/.config/kustodesk/` |

> ⚠️ Client secrets are stored in plain text in `clusters.json`. For production use, consider encrypting sensitive fields using Electron's `safeStorage` API.

---

## License

GNU General Public License v3.0 © [teems-labs](https://github.com/teems-labs)
