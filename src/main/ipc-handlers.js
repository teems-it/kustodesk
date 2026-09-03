// src/main/ipc-handlers.js
// All IPC handlers in one place. Electron touchpoints (ipcMain, dialog, window)
// are injected so the handlers can be integration-tested without launching Electron.

const fs = require('fs');
const { toCsv } = require('./csv');

function registerIpcHandlers({ ipcMain, store, kustoManager, dialog, getWindow }) {
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

  const makeDeviceCodeCallback = (event) => (message) => event.sender.send('auth:device-code-message', message);

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

  ipcMain.handle('kusto:get-resources', async (event, { url, database, authMethod, authConfig }) => {
    try {
      const onMsg = makeDeviceCodeCallback(event);
      const resources = await kustoManager.getResources(url, database, authMethod, authConfig, onMsg);
      return { success: true, resources };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // ── History ───────────────────────────────────────────────────────────────────

  ipcMain.handle('history:get', (_, clusterId) => store.getHistory(clusterId));

  ipcMain.handle('history:clear', (_, clusterId) => store.clearHistory(clusterId));

  // ── CSV Export ────────────────────────────────────────────────────────────────

  ipcMain.handle('export:csv', async (_, { columns, rows }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: 'Export to CSV',
      defaultPath: `adx-results-${Date.now()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (canceled || !filePath) return { success: false };

    fs.writeFileSync(filePath, toCsv(columns, rows), 'utf8');
    return { success: true, filePath };
  });
}

module.exports = { registerIpcHandlers };
