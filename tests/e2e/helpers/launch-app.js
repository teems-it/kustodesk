// tests/e2e/helpers/launch-app.js
// Shared "launch the real app wired to the mocked ADX" plumbing (spec 0005,
// Task 4). Per spec flow: start the mock Kusto server on an ephemeral loopback
// port, create an isolated data dir (KUSTODESK_DATA_DIR seam in main.js),
// optionally pre-seed it with the fixture cluster, then launch the dev
// Electron binary via playwright-core with the KUSTODESK_E2E_TOKEN auth seam
// set (src/main/kusto-client.js). cleanup() closes the app, stops the mock
// and removes the temp dir — the spec's "start, run, validate, clean-up" cycle.

import { _electron as electron } from 'playwright-core';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockKustoServer } from './mock-kusto-server.js';
import { clusterDefinition } from '../fixtures/kusto-fixtures.js';

// Same displayless guard as the original smoke test — CI runs the suite
// under `xvfb-run -a` instead. Suites use `it.skipIf(noDisplay)`.
export const noDisplay = process.platform === 'linux' && !process.env.DISPLAY;

// Static token accepted by the KUSTODESK_E2E_TOKEN seam. The mock never
// validates it — the value exists so tests can assert a real Bearer header
// flows from the app through the SDK to the mock.
export const E2E_TOKEN = 'e2e-static-bearer-token';

/**
 * Builds a clusters.json entry for the fixture cluster pointing at `url`.
 * id/createdAt/lastUsedAt mirror what Store.addCluster generates
 * (src/main/store.js); lastUsedAt makes it the auto-selected cluster on boot
 * (app.js init sorts by lastUsedAt and connects to the first).
 */
export function seededClusterDefinition(url) {
  return {
    id: 'e2e-fixture-cluster',
    createdAt: 0,
    lastUsedAt: 0,
    ...clusterDefinition(url),
  };
}

/**
 * Starts the mock Kusto server and launches the real Electron app against it.
 * @param {object} [options]
 * @param {boolean} [options.seedFixtureCluster=false] Pre-seed clusters.json
 *        with the fixture cluster pointing at the mock (auth method `cli` —
 *        the KUSTODESK_E2E_TOKEN seam must override it). On boot the app
 *        auto-selects it and loads databases: the full-wiring path.
 * @param {import('./mock-kusto-server.js').MockKustoServer['dataset']} [options.dataset]
 *        Override the mock's served dataset (defaults to the fixture dataset).
 * @returns {Promise<{app: *|import('playwright-core').ElectronApplication,
 *                    win: *|import('playwright-core').Page,
 *                    mock: *, dataDir: string, cleanup: () => Promise<void>}>}
 */
export async function launchApp({ seedFixtureCluster = false, dataset } = {}) {
  const mock = await startMockKustoServer(dataset ? { dataset } : undefined);
  const dataDir = mkdtempSync(join(tmpdir(), 'kustodesk-e2e-'));

  if (seedFixtureCluster) {
    // Written BEFORE launch: Store only _ensureFiles() creates missing files,
    // so the pre-seeded ones are loaded as-is (no app-side write needed).
    writeFileSync(
      join(dataDir, 'clusters.json'),
      JSON.stringify([seededClusterDefinition(mock.url())]),
    );
    writeFileSync(join(dataDir, 'history.json'), JSON.stringify([]));
  }

  const args = ['.'];
  if (process.env.CI) args.push('--no-sandbox', '--disable-gpu');

  const app = await electron.launch({
    args,
    env: {
      ...process.env,
      KUSTODESK_DATA_DIR: dataDir,
      KUSTODESK_E2E_TOKEN: E2E_TOKEN,
      // NOTE: KUSTODESK_E2E_EXPORT_DIR stays unset here — the CSV-export
      // scenario sets it explicitly on its own launch (spec scenario 8).
    },
  });

  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  let cleaned = false;
  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    await app.close();
    await mock.stop();
    rmSync(dataDir, { recursive: true, force: true });
  }

  return { app, win, mock, dataDir, cleanup };
}

/**
 * Resolves once the mock has received a command matching `csl` exactly
 * (the mock dispatches on literal trimmed text), rejecting on timeout.
 * Returns the received record: { path, db, csl, authorization }.
 */
export function waitForMockCommand(mock, csl, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`mock never received: ${csl}`)),
      timeoutMs,
    );
    (function check() {
      const rec = mock.received.find((r) => r.csl === csl);
      if (rec) {
        clearTimeout(timer);
        resolve(rec);
        return;
      }
      setTimeout(check, 50);
    })();
  });
}