// tests/integration/ipc-handlers.test.js
// Registers the real handlers with a fake ipcMain and injected stubs —
// covers the full IPC surface (`clusters:*`, `kusto:*`, `history:*`, `export:csv`).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerIpcHandlers } from '../../src/main/ipc-handlers';
import { toCsv } from '../../src/main/csv';

const ALL_CHANNELS = [
  'clusters:get-all', 'clusters:add', 'clusters:update', 'clusters:delete',
  'kusto:execute', 'kusto:test-connection', 'kusto:get-databases',
  'history:get', 'history:clear', 'export:csv',
];

function makeIpcMain() {
  const handlers = new Map();
  return {
    handle: (name, fn) => handlers.set(name, fn),
    // mimic ipcMain: handlers always receive (event, ...args)
    invoke: (name, ...args) => handlers.get(name)(event, ...args),
    handlers,
  };
}

let ipc, store, kustoManager, dialog, event;

beforeEach(() => {
  ipc = makeIpcMain();
  store = {
    getClusters: vi.fn().mockReturnValue([]),
    addCluster: vi.fn(),
    updateCluster: vi.fn(),
    deleteCluster: vi.fn().mockReturnValue(true),
    addHistory: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn(),
    touchCluster: vi.fn(),
  };
  kustoManager = {
    execute: vi.fn().mockResolvedValue({ columns: [], rows: [], rowCount: 0 }),
    getDatabases: vi.fn().mockResolvedValue(['db1']),
    testConnection: vi.fn().mockResolvedValue(true),
    invalidate: vi.fn(),
  };
  dialog = { showSaveDialog: vi.fn() };
  event = { sender: { send: vi.fn() } };

  registerIpcHandlers({
    ipcMain: ipc,
    store,
    kustoManager,
    dialog,
    getWindow: () => ({ fake: 'window' }),
  });
});

describe('registration', () => {
  it('registers every IPC channel', () => {
    for (const ch of ALL_CHANNELS) {
      expect(ipc.handlers.has(ch), `missing handler for ${ch}`).toBe(true);
    }
  });
});

describe('clusters:*', () => {
  it('get-all / add / update pass through to the store', () => {
    ipc.invoke('clusters:get-all');
    ipc.invoke('clusters:add', { name: 'x' });
    ipc.invoke('clusters:update', { id: 'c1', name: 'y' });

    expect(store.getClusters).toHaveBeenCalledTimes(1);
    expect(store.addCluster).toHaveBeenCalledWith({ name: 'x' });
    expect(store.updateCluster).toHaveBeenCalledWith({ id: 'c1', name: 'y' });
  });

  it('delete invalidates the cached kusto client, then deletes', () => {
    store.getClusters.mockReturnValue([
      { id: 'c1', url: 'https://help.kusto.windows.net', authMethod: 'app-registration', authConfig: { tenantId: 't1', clientId: 'cid' } },
    ]);

    const result = ipc.invoke('clusters:delete', 'c1');

    expect(kustoManager.invalidate).toHaveBeenCalledWith(
      'https://help.kusto.windows.net', 'app-registration', { tenantId: 't1', clientId: 'cid' }
    );
    expect(store.deleteCluster).toHaveBeenCalledWith('c1');
    expect(result).toBe(true);
  });

  it('delete of an unknown id does not invalidate anything', () => {
    store.getClusters.mockReturnValue([]);
    ipc.invoke('clusters:delete', 'ghost');
    expect(kustoManager.invalidate).not.toHaveBeenCalled();
  });
});

describe('kusto:execute', () => {
  const args = {
    clusterId: 'c1', url: 'https://help.kusto.windows.net', database: 'db',
    query: 'T | count', authMethod: 'cli', authConfig: {},
  };

  it('returns success with execution time, records history, touches cluster', async () => {
    kustoManager.execute.mockResolvedValue({ columns: [], rows: [1, 2], rowCount: 2 });

    const result = await ipc.invoke('kusto:execute', args);

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(2);
    expect(result.executionTimeMs).toBeTypeOf('number');

    expect(store.addHistory).toHaveBeenCalledTimes(1);
    const history = store.addHistory.mock.calls[0][0];
    expect(history.clusterId).toBe('c1');
    expect(history.database).toBe('db');
    expect(history.query).toBe('T | count');
    expect(history.rowCount).toBe(2);

    expect(store.touchCluster).toHaveBeenCalledWith('c1');
  });

  it('returns an error envelope and records nothing on failure', async () => {
    kustoManager.execute.mockRejectedValue(new Error('boom'));

    const result = await ipc.invoke('kusto:execute', args);

    expect(result).toEqual({ success: false, error: 'boom' });
    expect(store.addHistory).not.toHaveBeenCalled();
    expect(store.touchCluster).not.toHaveBeenCalled();
  });

  it('relays device-code messages to the renderer', async () => {
    kustoManager.execute.mockImplementation(
      async (_url, _db, _q, _m, _c, onDeviceCodeMessage) => {
        onDeviceCodeMessage('Enter code ABCD');
        return { columns: [], rows: [], rowCount: 0 };
      }
    );

    await ipc.invoke('kusto:execute', { ...args, authMethod: 'device-code' });

    expect(event.sender.send).toHaveBeenCalledWith('auth:device-code-message', 'Enter code ABCD');
  });
});

describe('kusto:test-connection / kusto:get-databases', () => {
  const args = { url: 'https://help.kusto.windows.net', authMethod: 'cli', authConfig: {} };

  it('test-connection success envelope', async () => {
    const result = await ipc.invoke('kusto:test-connection', args);
    expect(result).toEqual({ success: true });
  });

  it('test-connection error envelope', async () => {
    kustoManager.testConnection.mockRejectedValue(new Error('nope'));
    const result = await ipc.invoke('kusto:test-connection', args);
    expect(result).toEqual({ success: false, error: 'nope' });
  });

  it('get-databases returns the database list', async () => {
    const result = await ipc.invoke('kusto:get-databases', args);
    expect(result).toEqual({ success: true, databases: ['db1'] });
  });

  it('get-databases error envelope', async () => {
    kustoManager.getDatabases.mockRejectedValue(new Error('401'));
    const result = await ipc.invoke('kusto:get-databases', args);
    expect(result).toEqual({ success: false, error: '401' });
  });
});

describe('history:*', () => {
  it('get / clear pass through to the store', () => {
    ipc.invoke('history:get', 'c1');
    ipc.invoke('history:clear', 'c1');
    expect(store.getHistory).toHaveBeenCalledWith('c1');
    expect(store.clearHistory).toHaveBeenCalledWith('c1');
  });
});

describe('export:csv', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kustodesk-export-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const data = {
    columns: [{ name: 'id' }, { name: 'name' }],
    rows: [{ id: 1, name: 'a "quoted" name' }, { id: 2, name: null }],
  };

  it('writes a correctly-quoted CSV to the chosen path', async () => {
    const filePath = join(dir, 'out.csv');
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath });

    const result = await ipc.invoke('export:csv', data);

    expect(result).toEqual({ success: true, filePath });
    expect(readFileSync(filePath, 'utf8')).toBe(toCsv(data.columns, data.rows));
  });

  it('returns success:false and writes nothing when the dialog is canceled', async () => {
    const filePath = join(dir, 'out.csv');
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath });

    const result = await ipc.invoke('export:csv', data);

    expect(result).toEqual({ success: false });
    expect(existsSync(filePath)).toBe(false);
  });

  it('opens the save dialog on the main window', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: true });
    await ipc.invoke('export:csv', data);
    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      { fake: 'window' }, expect.objectContaining({ title: 'Export to CSV' })
    );
  });
});


