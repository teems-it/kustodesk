// tests/e2e/smoke.test.js
// Launch smoke tests, run via `npm run test:e2e` (skips on a displayless
// Linux box — CI runs it under xvfb-run instead).
//
//   1. bare launch with an isolated data dir — window opens, renderer loads,
//      hint-engine globals intact (0004 regression guard).
//   2. full-wiring launch against the MOCKED ADX (spec 0005 Task 4): the app
//      is pre-seeded with the fixture cluster, auto-connects on boot, and the
//      renderer reflects mock data — proving the complete path
//      store seed → renderer → IPC → kusto-client (KUSTODESK_E2E_TOKEN seam)
//      → real SDK over HTTP → mock server → back to the renderer,
//      before any scenario suite exists (Tasks 5+).
import { describe, it, expect } from 'vitest';
import {
  launchApp,
  noDisplay,
  waitForMockCommand,
  E2E_TOKEN,
} from './helpers/launch-app.js';
import {
  CLUSTER_NAME,
  DATABASE,
  DATABASES,
  TABLE_NAME,
  MV_NAME,
} from './fixtures/kusto-fixtures.js';

describe('app smoke launch', () => {
  it.skipIf(noDisplay)('opens a window that loads index.html', async () => {
    const { app, win, cleanup } = await launchApp();

    try {
      expect(win.url()).toContain('index.html');

      // Regression guard (0004): the hint-engine module must be loaded before
      // app.js — a missing <script> tag makes window.KustoHints undefined and
      // every completion invocation (Ctrl/⌘+Space and auto-popup) throws.
      const hintGlobals = await win.evaluate(() => ({
        hasKustoHints: typeof window.KustoHints?.buildCompletions === 'function',
        hasShowHint: typeof CodeMirror?.showHint === 'function',
      }));
      expect(hintGlobals.hasKustoHints).toBe(true);
      expect(hintGlobals.hasShowHint).toBe(true);

      // the app process should still be alive (no fatal crash on startup)
      expect(app.process().kill()).toBe(true);
    } finally {
      await cleanup();
    }
  }, 60000);

  it.skipIf(noDisplay)(
    'connects the seeded fixture cluster to the mocked ADX',
    async () => {
      const { win, mock, cleanup } = await launchApp({ seedFixtureCluster: true });

      try {
        // The full wiring: boot → auto-select the seeded cluster →
        // getDatabases → `.show databases` served by the mock.
        const rec = await waitForMockCommand(mock, '.show databases');
        expect(rec.db).toBe(''); // getDatabases runs with no db (pinned in kusto-client.test.js)
        expect(rec.authorization).toBe(`Bearer ${E2E_TOKEN}`);

        // Renderer reflects the mock — cluster in the sidebar…
        const clusterName = win.locator('.cluster-item .cluster-name');
        await clusterName.waitFor({ state: 'visible' });
        expect(await clusterName.textContent()).toBe(CLUSTER_NAME);

        // …the database dropdown populated from the fixture databases with
        // the first one auto-selected (playwright-core has no toHaveValue
        // assertion here — vitest's expect is not @playwright/test's, so the
        // auto-wait lives in waitForFunction instead).
        await win.waitForFunction(
          ([db]) => {
            const sel = document.getElementById('db-select');
            return sel && sel.value === db && sel.options.length === 3;
          },
          [DATABASE],
          { timeout: 15000 },
        );
        const options = await win.locator('#db-select option').allTextContents();
        expect(options.slice(1)).toEqual(DATABASES); // first option is the "— select database —" placeholder

        // …and the status bar reports a successful connection.
        await win.waitForFunction(
          ([txt]) => document.getElementById('conn-status')?.textContent === txt,
          [`Connected · ${CLUSTER_NAME}`],
          { timeout: 15000 },
        );

        // Resources sidebar reflects the mocked `.show tables` /
        // `.show materialized views` rows.
        await win
          .locator(`.resource-item[data-name="${TABLE_NAME}"]`)
          .waitFor({ state: 'visible' });
        await win
          .locator(`.resource-item[data-name="${MV_NAME}"]`)
          .waitFor({ state: 'visible' });
      } finally {
        await cleanup();
      }
    },
    60000,
  );
});
