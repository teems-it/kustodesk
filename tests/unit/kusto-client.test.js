// tests/unit/kusto-client.test.js
// azure-kusto-data and child_process (the `az` shell-out) are stubbed by
// patching the real CommonJS module exports *before* kusto-client.js loads —
// vi.mock can't intercept `require()` calls made inside a CJS module.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const kusto = {
  Client: vi.fn(),
  withTokenProvider: vi.fn((url, cb) => ({ url, type: 'token-provider', cb })),
  withAadDeviceAuthentication: vi.fn((url, tenantId, cb) => ({ url, type: 'device-code', tenantId, cb })),
  withAadApplicationKeyAuthentication: vi.fn((url, clientId, clientSecret, tenantId) => ({
    url, type: 'app-key', clientId, clientSecret, tenantId,
  })),
  execute: vi.fn(),
  executeMgmt: vi.fn(),
};

const akd = require('azure-kusto-data');
akd.Client = kusto.Client;
akd.KustoConnectionStringBuilder = {
  withTokenProvider: kusto.withTokenProvider,
  withAadDeviceAuthentication: kusto.withAadDeviceAuthentication,
  withAadApplicationKeyAuthentication: kusto.withAadApplicationKeyAuthentication,
};

const execSync = vi.fn();
require('child_process').execSync = execSync;

const { KustoClientManager } = await import('../../src/main/kusto-client');

const URL = 'https://help.kusto.windows.net';
const QUERY_RESULT = {
  primaryResults: [{
    columns: [{ name: 'A', columnType: 'string' }, { name: 'B', columnType: 'long' }],
    rows: () => [
      { toJSON: () => ({ A: 'x', B: 1 }) },
      { toJSON: () => ({ A: 'y', B: 2 }) },
    ],
  }],
};

// fresh manager per test so the client cache never leaks between tests
let mgr;
beforeEach(() => {
  vi.clearAllMocks();
  kusto.execute = vi.fn().mockResolvedValue(QUERY_RESULT);
  kusto.executeMgmt = vi.fn();
  kusto.Client.mockImplementation(() => ({ execute: kusto.execute, executeMgmt: kusto.executeMgmt }));
  mgr = new KustoClientManager();
});

describe('_buildKcsb per auth method', () => {
  it('cli → withTokenProvider, callback shells out to az', async () => {
    execSync.mockReturnValue(JSON.stringify({ accessToken: 'tok123' }));

    await mgr.execute(URL, 'db', 'T | count', 'cli', {});

    expect(kusto.withTokenProvider).toHaveBeenCalledTimes(1);
    const [url, tokenCallback] = kusto.withTokenProvider.mock.calls[0];
    expect(url).toBe(URL);
    await expect(tokenCallback()).resolves.toBe('tok123');
    const cmd = execSync.mock.calls[0][0];
    expect(cmd).toContain('az account get-access-token');
    expect(cmd).toContain('--resource https://kusto.kusto.windows.net');
  });

  it('cli callback includes --tenant when tenantId is configured', async () => {
    await mgr.execute(URL, 'db', 'T | count', 'cli', { tenantId: 'my-tenant' });

    const [, tokenCallback] = kusto.withTokenProvider.mock.calls[0];
    await tokenCallback();
    expect(execSync.mock.calls[0][0]).toContain('--tenant my-tenant');
  });

  it('cli callback wraps az failures in a readable error', async () => {
    execSync.mockImplementation(() => { throw new Error('az: command not found'); });

    await mgr.execute(URL, 'db', 'T | count', 'cli', {});
    const [, tokenCallback] = kusto.withTokenProvider.mock.calls[0];

    await expect(tokenCallback()).rejects.toThrow('az CLI token acquisition failed');
    await expect(tokenCallback()).rejects.toThrow('az: command not found');
  });

  it('device-code → withAadDeviceAuthentication with tenant + callback', async () => {
    const onMsg = vi.fn();
    await mgr.execute(URL, 'db', 'T | count', 'device-code', { tenantId: 't1' }, onMsg);

    expect(kusto.withAadDeviceAuthentication).toHaveBeenCalledWith(URL, 't1', onMsg);
  });

  it('app-registration → withAadApplicationKeyAuthentication with full config', async () => {
    const cfg = { tenantId: 't1', clientId: 'cid', clientSecret: 'sec' };
    await mgr.execute(URL, 'db', 'T | count', 'app-registration', cfg);

    expect(kusto.withAadApplicationKeyAuthentication).toHaveBeenCalledWith(URL, 'cid', 'sec', 't1');
  });


});

describe('client cache', () => {
  it('reuses a cached client for the same url + auth method', async () => {
    await mgr.execute(URL, 'db', 'T', 'cli', {});
    await mgr.execute(URL, 'db', 'T', 'cli', {});
    expect(kusto.Client).toHaveBeenCalledTimes(1);
  });

  it('keys app-registration clients by tenantId:clientId', async () => {
    const cfg = { tenantId: 't1', clientId: 'cid', clientSecret: 'sec' };
    await mgr.execute(URL, 'db', 'T', 'app-registration', cfg);
    await mgr.execute(URL, 'db', 'T', 'app-registration', cfg);
    expect(kusto.Client).toHaveBeenCalledTimes(1);

    await mgr.execute(URL, 'db', 'T', 'app-registration', { ...cfg, clientId: 'other' });
    expect(kusto.Client).toHaveBeenCalledTimes(2);
  });

  it('never caches device-code clients', async () => {
    await mgr.execute(URL, 'db', 'T', 'device-code', {});
    await mgr.execute(URL, 'db', 'T', 'device-code', {});
    expect(kusto.Client).toHaveBeenCalledTimes(2);
  });

  it('distinguishes different auth methods on the same url', async () => {
    await mgr.execute(URL, 'db', 'T', 'cli', {});
    await mgr.execute(URL, 'db', 'T', 'app-registration', { tenantId: 't1', clientId: 'cid', clientSecret: 'sec' });
    expect(kusto.Client).toHaveBeenCalledTimes(2);
  });

  it('invalidate() forces a fresh client on the next request', async () => {
    await mgr.execute(URL, 'db', 'T', 'cli', {});
    await mgr.execute(URL, 'db', 'T', 'cli', {});
    expect(kusto.Client).toHaveBeenCalledTimes(1);

    mgr.invalidate(URL, 'cli', {});
    await mgr.execute(URL, 'db', 'T', 'cli', {});
    expect(kusto.Client).toHaveBeenCalledTimes(2);
  });
});

describe('result mapping (azure-kusto-data v6 API)', () => {
  it('execute maps columns and rows() via toJSON()', async () => {
    const res = await mgr.execute(URL, 'db', 'T | count', 'cli', {});

    expect(kusto.execute).toHaveBeenCalledWith('db', 'T | count');
    expect(res).toEqual({
      columns: [{ name: 'A', type: 'string' }, { name: 'B', type: 'long' }],
      rows: [{ A: 'x', B: 1 }, { A: 'y', B: 2 }],
      rowCount: 2,
    });
  });

  it('execute defaults missing columnType to "dynamic"', async () => {
    kusto.execute.mockResolvedValue({
      primaryResults: [{ columns: [{ name: 'C' }], rows: () => [] }],
    });

    const res = await mgr.execute(URL, 'db', 'T', 'cli', {});
    expect(res.columns).toEqual([{ name: 'C', type: 'dynamic' }]);
  });

  it('getDatabases uses executeMgmt with .show databases and filters named DBs', async () => {
    kusto.executeMgmt.mockResolvedValue({
      primaryResults: [{
        rows: () => [
          { toJSON: () => ({ DatabaseName: 'db1' }) },
          { toJSON: () => ({ DatabaseName: 'db2' }) },
          { toJSON: () => ({ Other: 1 }) },
        ],
      }],
    });

    const dbs = await mgr.getDatabases(URL, 'cli', {});
    expect(kusto.executeMgmt).toHaveBeenCalledWith('', '.show databases');
    expect(dbs).toEqual(['db1', 'db2']);
  });

  it('testConnection returns true when .show databases succeeds', async () => {
    kusto.executeMgmt.mockResolvedValue({ primaryResults: [{ rows: () => [] }] });
    expect(await mgr.testConnection(URL, 'cli', {})).toBe(true);
  });

  it('testConnection propagates failures', async () => {
    kusto.executeMgmt.mockRejectedValue(new Error('401 Unauthorized'));
    await expect(mgr.testConnection(URL, 'cli', {})).rejects.toThrow('401 Unauthorized');
  });
});

