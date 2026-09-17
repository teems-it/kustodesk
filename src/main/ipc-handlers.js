// src/main/ipc-handlers.js
// All IPC handlers in one place. Electron touchpoints (ipcMain, dialog, window)
// are injected so the handlers can be integration-tested without launching Electron.

const fs = require('fs');
const path = require('path');
const { toCsv } = require('./csv');
const { describeKustoError } = require('./kusto-client');

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
      return { success: false, error: describeKustoError(err) };
    }
  });

  ipcMain.handle('kusto:test-connection', async (event, { url, authMethod, authConfig }) => {
    try {
      const onMsg = makeDeviceCodeCallback(event);
      await kustoManager.testConnection(url, authMethod, authConfig, onMsg);
      return { success: true };
    } catch (err) {
      return { success: false, error: describeKustoError(err) };
    }
  });

  ipcMain.handle('kusto:get-databases', async (event, { url, authMethod, authConfig }) => {
    try {
      const onMsg = makeDeviceCodeCallback(event);
      const databases = await kustoManager.getDatabases(url, authMethod, authConfig, onMsg);
      return { success: true, databases };
    } catch (err) {
      return { success: false, error: describeKustoError(err) };
    }
  });

  ipcMain.handle('kusto:get-resources', async (event, { url, database, authMethod, authConfig }) => {
    try {
      const onMsg = makeDeviceCodeCallback(event);
      const resources = await kustoManager.getResources(url, database, authMethod, authConfig, onMsg);
      return { success: true, resources };
    } catch (err) {
      return { success: false, error: describeKustoError(err) };
    }
  });

  ipcMain.handle('kusto:get-schema', async (event, { url, database, authMethod, authConfig }) => {
    try {
      const onMsg = makeDeviceCodeCallback(event);
      const schema = await kustoManager.getSchema(url, database, authMethod, authConfig, onMsg);
      return { success: true, schema };
    } catch (err) {
      return { success: false, error: describeKustoError(err) };
    }
  });

  // ── History ───────────────────────────────────────────────────────────────────

  ipcMain.handle('history:get', (_, clusterId) => store.getHistory(clusterId));

  ipcMain.handle('history:clear', (_, clusterId) => store.clearHistory(clusterId));

  // ── CSV Export ────────────────────────────────────────────────────────────────

  ipcMain.handle('export:csv', async (_, { columns, rows }) => {
    // Test-only seam (spec 0005): the native save dialog cannot be driven by the
    // E2E tests, so when KUSTODESK_E2E_EXPORT_DIR is set, skip the dialog and
    // write to a uniquely named file in that dir, returning the same envelope.
    // Without the env var this branch is a no-op and the dialog flow is unchanged.
    const e2eExportDir = process.env.KUSTODESK_E2E_EXPORT_DIR;
    if (e2eExportDir) {
      const filePath = path.join(e2eExportDir, `adx-results-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.csv`);
      fs.writeFileSync(filePath, toCsv(columns, rows), 'utf8');
      return { success: true, filePath };
    }

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
