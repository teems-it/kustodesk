// tests/e2e/smoke.test.js
// Launches the real Electron app with an isolated data dir and asserts the
// window opens and loads the renderer. Run via `npm run test:e2e`.
// Skips on a displayless Linux box (CI runs it under xvfb-run instead).
import { describe, it, expect, afterAll } from 'vitest';
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const noDisplay = process.platform === 'linux' && !process.env.DISPLAY;

const dataDirs = [];
afterAll(() => {
  for (const d of dataDirs) rmSync(d, { recursive: true, force: true });
});

describe('app smoke launch', () => {
  it.skipIf(noDisplay)('opens a window that loads index.html', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'kustodesk-e2e-'));
    dataDirs.push(dataDir);

    const args = ['.'];
    if (process.env.CI) args.push('--no-sandbox', '--disable-gpu');

    const app = await electron.launch({
      args,
      env: { ...process.env, KUSTODESK_DATA_DIR: dataDir },
    });

    try {
      const win = await app.firstWindow();
      await win.waitForLoadState('domcontentloaded');

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
      await app.close();
    }
  }, 60000);
});
