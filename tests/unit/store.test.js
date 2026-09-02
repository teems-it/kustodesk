// tests/unit/store.test.js
// Real temp dirs + real fs — no mocks. The Store's optional dataDir constructor
// argument (see spec 0002) makes it constructible without Electron.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../src/main/store';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kustodesk-store-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const readJson = (file) => JSON.parse(readFileSync(join(dir, file), 'utf8'));

describe('Store', () => {
  it('creates empty data files on first run', () => {
    new Store(dir);
    expect(existsSync(join(dir, 'clusters.json'))).toBe(true);
    expect(existsSync(join(dir, 'history.json'))).toBe(true);
    expect(readJson('clusters.json')).toEqual([]);
    expect(readJson('history.json')).toEqual([]);
  });

  describe('clusters', () => {
    it('addCluster assigns id/createdAt and persists', () => {
      const store = new Store(dir);
      const c = store.addCluster({ name: 'help', url: 'https://help.kusto.windows.net', authMethod: 'cli' });

      expect(c.id).toBeTruthy();
      expect(c.createdAt).toBeTypeOf('number');
      expect(c.lastUsedAt).toBeNull();
      expect(store.getClusters()).toHaveLength(1);
      expect(readJson('clusters.json')[0].name).toBe('help');
    });

    it('updateCluster merges fields and persists', () => {
      const store = new Store(dir);
      const c = store.addCluster({ name: 'help', url: 'https://help.kusto.windows.net', authMethod: 'cli' });

      const updated = store.updateCluster({ id: c.id, name: 'renamed' });
      expect(updated.name).toBe('renamed');
      expect(updated.url).toBe('https://help.kusto.windows.net');
      expect(readJson('clusters.json')[0].name).toBe('renamed');
    });

    it('updateCluster returns null for an unknown id', () => {
      const store = new Store(dir);
      expect(store.updateCluster({ id: 'nope', name: 'x' })).toBeNull();
    });

    it('touchCluster sets lastUsedAt', () => {
      const store = new Store(dir);
      const c = store.addCluster({ name: 'help', url: 'https://help.kusto.windows.net' });

      store.touchCluster(c.id);
      expect(store.getClusters()[0].lastUsedAt).toBeTypeOf('number');
    });

    it('deleteCluster removes the cluster and cascades to its history only', () => {
      const store = new Store(dir);
      const c1 = store.addCluster({ name: 'one', url: 'https://one.kusto.windows.net' });
      const c2 = store.addCluster({ name: 'two', url: 'https://two.kusto.windows.net' });
      store.addHistory({ clusterId: c1.id, query: 'q1' });
      store.addHistory({ clusterId: c1.id, query: 'q2' });
      store.addHistory({ clusterId: c2.id, query: 'q3' });

      expect(store.deleteCluster(c1.id)).toBe(true);
      expect(store.getClusters().map((c) => c.name)).toEqual(['two']);
      expect(store.getHistory(c1.id)).toEqual([]);
      expect(store.getHistory(c2.id).map((h) => h.query)).toEqual(['q3']);
    });
  });

  describe('history', () => {
    it('addHistory prepends newest first and assigns id/executedAt', () => {
      const store = new Store(dir);
      const h1 = store.addHistory({ clusterId: 'c1', query: 'first' });
      const h2 = store.addHistory({ clusterId: 'c1', query: 'second' });

      expect(store.getHistory('c1').map((h) => h.query)).toEqual(['second', 'first']);
      expect(h2.id).toBeTruthy();
      expect(h2.executedAt).toBeTypeOf('number');
    });

    it('caps history at 200 entries, keeping the newest', () => {
      const store = new Store(dir);
      for (let i = 0; i < 205; i++) {
        store.addHistory({ clusterId: 'c1', query: `q-${i}` });
      }

      const history = store.getHistory();
      expect(history).toHaveLength(200);
      expect(history[0].query).toBe('q-204');
      expect(history[199].query).toBe('q-5');
      expect(readJson('history.json')).toHaveLength(200);
    });

    it('getHistory filters by clusterId; no arg returns all', () => {
      const store = new Store(dir);
      store.addHistory({ clusterId: 'c1', query: 'a' });
      store.addHistory({ clusterId: 'c2', query: 'b' });

      expect(store.getHistory('c1')).toHaveLength(1);
      expect(store.getHistory()).toHaveLength(2);
    });

    it('clearHistory removes only that cluster\'s entries', () => {
      const store = new Store(dir);
      store.addHistory({ clusterId: 'c1', query: 'a' });
      store.addHistory({ clusterId: 'c2', query: 'b' });

      store.clearHistory('c1');
      expect(store.getHistory('c1')).toEqual([]);
      expect(store.getHistory('c2')).toHaveLength(1);
    });
  });

  it('tolerates corrupted JSON files', () => {
    writeFileSync(join(dir, 'clusters.json'), '{not valid json');
    writeFileSync(join(dir, 'history.json'), 'garbage');

    const store = new Store(dir);
    expect(store.getClusters()).toEqual([]);
    expect(store.getHistory()).toEqual([]);
  });

  it('persists across instances', () => {
    const store1 = new Store(dir);
    store1.addCluster({ name: 'help', url: 'https://help.kusto.windows.net' });
    store1.addHistory({ clusterId: 'c1', query: 'keep me' });

    const store2 = new Store(dir);
    expect(store2.getClusters()).toHaveLength(1);
    expect(store2.getHistory()).toHaveLength(1);
  });
});
