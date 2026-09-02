#!/usr/bin/env node
// scripts/fix-electron-macos-signature.js
//
// Runs automatically after `npm install` (see "postinstall" in package.json).
//
// Why: Apple revoked the notarization hash of some Electron 31 builds, so a
// freshly downloaded dev binary gets flagged by Gatekeeper ("Electron will
// damage your computer") and is blocked/removed on first launch. Re-signing
// the bundle ad-hoc strips the revoked signature; locally spawned ad-hoc apps
// skip the notarization check entirely.
//
// No-op on non-macOS platforms or when the Electron dist is absent.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

if (process.platform !== 'darwin') process.exit(0);

const appPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app');
if (!fs.existsSync(appPath)) process.exit(0);

try {
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
  console.log('[postinstall] Re-signed Electron.app ad-hoc (Apple revoked the notarization of some Electron 31 builds — see scripts/fix-electron-macos-signature.js).');
} catch (err) {
  // Non-fatal: signature repair is best-effort.
  console.warn('[postinstall] Could not re-sign Electron.app:', err.message);
  console.warn('[postinstall] If macOS blocks the app, run: codesign --force --deep --sign - node_modules/electron/dist/Electron.app');
}
