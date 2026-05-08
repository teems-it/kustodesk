// src/main/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adxAPI', {
  // Clusters
  getClusters: () => ipcRenderer.invoke('clusters:get-all'),
  addCluster: (cluster) => ipcRenderer.invoke('clusters:add', cluster),
  updateCluster: (cluster) => ipcRenderer.invoke('clusters:update', cluster),
  deleteCluster: (id) => ipcRenderer.invoke('clusters:delete', id),

  // Kusto
  executeQuery: (params) => ipcRenderer.invoke('kusto:execute', params),
  testConnection: (params) => ipcRenderer.invoke('kusto:test-connection', params),
  getDatabases: (params) => ipcRenderer.invoke('kusto:get-databases', params),

  // History
  getHistory: (clusterId) => ipcRenderer.invoke('history:get', clusterId),
  clearHistory: (clusterId) => ipcRenderer.invoke('history:clear', clusterId),

  // Export
  exportCsv: (data) => ipcRenderer.invoke('export:csv', data),

  // Events from main process
  onDeviceCodeMessage: (callback) =>
    ipcRenderer.on('auth:device-code-message', (_, msg) => callback(msg)),
  offDeviceCodeMessage: () =>
    ipcRenderer.removeAllListeners('auth:device-code-message'),
});
