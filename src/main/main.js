// src/main/main.js

// ── macOS PATH fix ────────────────────────────────────────────────────────────
// Electron on macOS doesn't inherit the full shell PATH, so `az` (installed via
// Homebrew) is not found when AzureCliCredential tries to call `az account get-access-token`.
// Prepend the common locations here so it works regardless of how the app was launched.
if (process.platform === 'darwin' || process.platform === 'linux') {
  const extraPaths = [
    '/opt/homebrew/bin',       // macOS Apple Silicon (Homebrew)
    '/usr/local/bin',          // macOS Intel (Homebrew) / common Linux
    '/home/linuxbrew/.linuxbrew/bin', // Linux Homebrew
    '/usr/bin',
    '/bin',
  ];
  const current = process.env.PATH || '';
  const parts = current.split(':').filter(Boolean);
  for (const p of extraPaths.reverse()) {
    if (!parts.includes(p)) parts.unshift(p);
  }
  process.env.PATH = parts.join(':');
}

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { KustoClientManager } = require('./kusto-client');
const { Store } = require('./store');
const { registerIpcHandlers } = require('./ipc-handlers');

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

app.whenReady().then(() => {
  // Tests (E2E) can isolate the data dir via env var instead of touching real userData
  if (process.env.KUSTODESK_DATA_DIR) {
    app.setPath('userData', process.env.KUSTODESK_DATA_DIR);
  }

  store = new Store();

  registerIpcHandlers({
    ipcMain,
    store,
    kustoManager,
    dialog: require('electron').dialog,
    getWindow: () => mainWindow,
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

