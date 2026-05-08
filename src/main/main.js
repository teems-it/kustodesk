// src/main/main.js
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { KustoClientManager } = require('./kusto-client');
const { Store } = require('./store');

let mainWindow;
const kustoManager = new KustoClientManager();
let store;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

// ── Cluster CRUD ────────────────────────────────────────────────────────────

ipcMain.handle('clusters:get-all', () => store.getClusters());

ipcMain.handle('clusters:add', (_, cluster) => store.addCluster(cluster));

ipcMain.handle('clusters:update', (_, cluster) => store.updateCluster(cluster));

ipcMain.handle('clusters:delete', (_, id) => {
  // Clear cached client for this cluster before deleting
  const cluster = store.getClusters().find(c => c.id === id);
  if (cluster) kustoManager.invalidate(cluster.url, cluster.authMethod, cluster.authConfig || {});
  return store.deleteCluster(id);
});

// ── Kusto queries ────────────────────────────────────────────────────────────

function makeDeviceCodeCallback(event) {
  return (message) => event.sender.send('auth:device-code-message', message);
}

ipcMain.handle('kusto:execute', async (event, { clusterId, url, database, query, authMethod, authConfig }) => {
  try {
    const onMsg = makeDeviceCodeCallback(event);
    const start = Date.now();
    const result = await kustoManager.execute(url, database, query, authMethod, authConfig, onMsg);
    result.executionTimeMs = Date.now() - start;

    store.addHistory({ clusterId, database, query, rowCount: result.rowCount, executionTimeMs: result.executionTimeMs });
    store.touchCluster(clusterId);

    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('kusto:test-connection', async (event, { url, authMethod, authConfig }) => {
  try {
    const onMsg = makeDeviceCodeCallback(event);
    await kustoManager.testConnection(url, authMethod, authConfig, onMsg);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('kusto:get-databases', async (event, { url, authMethod, authConfig }) => {
  try {
    const onMsg = makeDeviceCodeCallback(event);
    const databases = await kustoManager.getDatabases(url, authMethod, authConfig, onMsg);
    return { success: true, databases };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// ── History ───────────────────────────────────────────────────────────────────

ipcMain.handle('history:get', (_, clusterId) => store.getHistory(clusterId));

ipcMain.handle('history:clear', (_, clusterId) => store.clearHistory(clusterId));

// ── CSV Export ────────────────────────────────────────────────────────────────

ipcMain.handle('export:csv', async (_, { columns, rows }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export to CSV',
    defaultPath: `adx-results-${Date.now()}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });

  if (canceled || !filePath) return { success: false };

  const fs = require('fs');
  const header = columns.map((c) => `"${c.name}"`).join(',');
  const rowLines = rows.map((row) =>
    columns.map((c) => {
      const val = row[c.name];
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [header, ...rowLines].join('\n');
  fs.writeFileSync(filePath, csv, 'utf8');
  return { success: true, filePath };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  store = new Store();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
