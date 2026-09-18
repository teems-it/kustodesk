// tests/e2e/clusters.test.js
// Spec 0005 Task 5 — cluster lifecycle scenarios (spec scenarios 1–3):
//   1. Cluster CRUD: add/edit through the modal + clusters.json persistence;
//      delete cascades the cluster's query history.
//   2. Test connection: success against the mock, then a failure whose mocked
//      Kusto error text surfaces via describeKustoError.
//   3. Database selection: dropdown populated from the mocked `.show databases`.
//
// Harness conventions (decision 2026-09-18):
//   - vitest's expect is NOT @playwright/test's — renderer assertions use
//     playwright-core wait APIs (locator.waitFor, page.waitForFunction) +
//     plain text/value comparisons.
//   - waitForMockCommand* only proves the mock RECEIVED a command — always
//     follow with a DOM wait before asserting UI state.
//
// The modal-driven tests launch over `tls: true`: the app's validateModal()
// rejects non-https:// cluster URLs, so "add a cluster pointing at the mock"
// requires the https mock (self-signed loopback cert; NODE_TLS_REJECT_
// UNAUTHORIZED=0 is set in the app's env only — see launch-app.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  launchApp,
  noDisplay,
  waitForMockCommand,
  waitForMockCommandWhere,
} from './helpers/launch-app.js';
import {
  DATABASE,
  DATABASES,
  ERRORS,
  TABLE_NAME,
} from './fixtures/kusto-fixtures.js';

const ADDED_NAME = 'E2E Added Cluster';
const EDITED_NAME = 'E2E Edited Cluster';

function readJson(dataDir, file) {
  return JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
}

// Modal helper: open, wait for the modal chrome to be visible.
async function openClusterModal(win) {
  await win.click('#btn-new-cluster');
  await win.locator('#cluster-modal').waitFor({ state: 'visible' });
  await win.locator('#cluster-modal-title').waitFor({ state: 'visible' });
}

describe('cluster lifecycle scenarios (spec 0005, scenarios 1–3)', () => {
  it.skipIf(noDisplay)(
    'adds and edits a cluster through the modal, persisting to clusters.json',
    async () => {
      const { win, mock, dataDir, cleanup } = await launchApp({ tls: true });

      try {
        // Start from an empty data dir: no clusters yet.
        expect(readJson(dataDir, 'clusters.json')).toEqual([]);

        // ── ADD ────────────────────────────────────────────────────────────
        await openClusterModal(win);
        expect(await win.locator('#cluster-modal-title').textContent())
          .toBe('Add Cluster');
        await win.fill('#input-cluster-name', ADDED_NAME);
        await win.fill('#input-cluster-url', mock.url());
        await win.click('#btn-modal-save');
        await win.locator('#cluster-modal').waitFor({ state: 'hidden' });

        // Sidebar reflects the add (DOM wait — the toast alone proves nothing).
        await win.waitForFunction(
          ([name]) =>
            document.querySelector('.cluster-item .cluster-name')?.textContent === name,
          [ADDED_NAME],
          { timeout: 15000 },
        );

        // clusters.json persisted the new cluster exactly as Store.addCluster
        // shapes it (id/createdAt/lastUsedAt added, form fields passed through).
        const afterAdd = readJson(dataDir, 'clusters.json');
        expect(afterAdd).toHaveLength(1);
        expect(afterAdd[0].name).toBe(ADDED_NAME);
        expect(afterAdd[0].url).toBe(mock.url());
        expect(afterAdd[0].authMethod).toBe('cli');
        expect(typeof afterAdd[0].id).toBe('string');
        expect(typeof afterAdd[0].createdAt).toBe('number');

        // Adding must NOT connect: no `.show databases` or any other command.
        expect(mock.received).toHaveLength(0);

        // ── EDIT ───────────────────────────────────────────────────────────
        // The edit/delete buttons are hover-only (.cluster-item:hover
        // .cluster-actions) — hover the row first or the click never fires.
        await win.hover('.cluster-item');
        await win.click('.cluster-item [data-action="edit"]');
        await win.locator('#cluster-modal').waitFor({ state: 'visible' });
        expect(await win.locator('#cluster-modal-title').textContent())
          .toBe('Edit Cluster');
        // The form is prefilled from the stored cluster.
        await win.waitForFunction(
          ([name]) => document.getElementById('input-cluster-name')?.value === name,
          [ADDED_NAME],
          { timeout: 15000 },
        );
        await win.fill('#input-cluster-name', EDITED_NAME);
        await win.click('#btn-modal-save');
        await win.locator('#cluster-modal').waitFor({ state: 'hidden' });

        await win.waitForFunction(
          ([name]) =>
            document.querySelector('.cluster-item .cluster-name')?.textContent === name,
          [EDITED_NAME],
          { timeout: 15000 },
        );

        // Same single entry, same id, new name — an edit, not a re-add.
        const afterEdit = readJson(dataDir, 'clusters.json');
        expect(afterEdit).toHaveLength(1);
        expect(afterEdit[0].name).toBe(EDITED_NAME);
        expect(afterEdit[0].id).toBe(afterAdd[0].id);
        expect(afterEdit[0].url).toBe(afterAdd[0].url);
        expect(mock.received).toHaveLength(0);
      } finally {
        await cleanup();
      }
    },
    60000,
  );

  it.skipIf(noDisplay)(
    'test connection: success reports connectivity; failure surfaces the mocked Kusto error',
    async () => {
      const { win, mock, cleanup } = await launchApp({ tls: true });

      try {
        await openClusterModal(win);
        await win.fill('#input-cluster-name', 'Connection Test Cluster');
        await win.fill('#input-cluster-url', mock.url());

        // ── SUCCESS ────────────────────────────────────────────────────────
        await win.click('#btn-modal-test');
        // The round-trip actually happened (mock received `.show databases`).
        await waitForMockCommand(mock, '.show databases');
        // Renderer reflects it: success toast (DOM wait after the mock wait).
        await win.waitForFunction(
          () => {
            const toast = document.getElementById('toast');
            return toast?.textContent === 'Connection successful!' &&
              toast.className.includes('success');
          },
          null,
          { timeout: 15000 },
        );

        // ── FAILURE ────────────────────────────────────────────────────────
        // Flip the mock's `.show databases` to a Kusto error at runtime; the
        // same URL/auth now fails, exercising the describeKustoError path.
        mock.server.dataset.mgmt['.show databases'] = {
          error: ERRORS.connectionFailed,
        };
        await win.click('#btn-modal-test');
        await win.waitForFunction(
          ([txt]) => document.getElementById('modal-error')?.textContent === txt,
          [`Connection failed: ${ERRORS.connectionFailed.message}`],
          { timeout: 15000 },
        );
        // The modal stays open (the failure is inline, not a toast).
        expect(await win.locator('#cluster-modal').isVisible()).toBe(true);
      } finally {
        await cleanup();
      }
    },
    60000,
  );

  it.skipIf(noDisplay)(
    'deleting a cluster cascades its query history',
    async () => {
      const historyEntry = {
        clusterId: 'e2e-fixture-cluster',
        database: DATABASE,
        query: 'StormEvents | count',
        rowCount: 1,
        executionTimeMs: 5,
      };
      const { win, dataDir, cleanup } = await launchApp({
        seedFixtureCluster: true,
        seedHistory: [historyEntry],
      });

      try {
        // The seeded cluster connected on boot and its history is rendered —
        // implicit proof the entry belongs to the right cluster.
        await win
          .locator(`.history-item[data-query="${historyEntry.query}"]`)
          .waitFor({ state: 'visible', timeout: 15000 });

        // Delete: the renderer gates on window.confirm — override it in the
        // page (a native dialog cannot be driven by Playwright).
        await win.evaluate(() => {
          window.confirm = () => true;
        });
        // Hover-only action buttons — same as the edit click above.
        await win.hover('.cluster-item');
        await win.click('.cluster-item [data-action="delete"]');

        // Sidebar back to the empty state…
        await win.waitForFunction(
          () =>
            document
              .getElementById('cluster-list')
              ?.textContent.includes('No clusters added yet.'),
          null,
          { timeout: 15000 },
        );
        // …clusters.json is empty…
        expect(readJson(dataDir, 'clusters.json')).toEqual([]);
        // …and the cascade removed the cluster's history too.
        expect(readJson(dataDir, 'history.json')).toEqual([]);
      } finally {
        await cleanup();
      }
    },
    60000,
  );

  it.skipIf(noDisplay)(
    'database dropdown lists exactly the fixture databases and drives resource loading',
    async () => {
      const { win, mock, cleanup } = await launchApp({ seedFixtureCluster: true });

      try {
        // Boot auto-connects the seeded cluster and populates the dropdown
        // from the mocked `.show databases` (first fixture db auto-selected).
        await win.waitForFunction(
          ([db]) => {
            const sel = document.getElementById('db-select');
            return sel && sel.value === db && sel.options.length === 3;
          },
          [DATABASE],
          { timeout: 15000 },
        );
        const options = await win.locator('#db-select option').allTextContents();
        expect(options.slice(1)).toEqual(DATABASES); // first option is the placeholder

        // Selecting the second database re-loads resources for THAT database:
        // the mock must receive a db-scoped `.show tables` for AuxDB…
        await win.selectOption('#db-select', DATABASES[1]);
        const rec = await waitForMockCommandWhere(
          mock,
          (r) => r.csl === '.show tables' && r.db === DATABASES[1],
        );
        expect(rec.db).toBe(DATABASES[1]);

        // …and the renderer reflects the new selection (DOM wait after the
        // mock wait — the received record alone proves nothing about the UI).
        await win.waitForFunction(
          ([db]) => document.querySelector('.resource-root')?.textContent === db,
          [DATABASES[1]],
          { timeout: 15000 },
        );
        await win
          .locator(`.resource-item[data-name="${TABLE_NAME}"]`)
          .waitFor({ state: 'visible' });
      } finally {
        await cleanup();
      }
    },
    60000,
  );
});
