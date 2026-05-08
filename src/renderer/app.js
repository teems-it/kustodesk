// src/renderer/app.js — Main UI controller

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  clusters: [],
  activeCluster: null,
  databases: [],
  activeDatabase: '',
  results: null,
  activeTab: 'table',
  editingClusterId: null,
  activeAuthTab: 'cli',
  sortCol: null,
  sortDir: 1,
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const dom = {
  clusterList:    $('cluster-list'),
  historyList:    $('history-list'),
  dbSelect:       $('db-select'),
  btnRun:         $('btn-run'),
  btnExportCsv:   $('btn-export-csv'),
  btnCopyResults: $('btn-copy-results'),
  btnRefreshDbs:  $('btn-refresh-dbs'),
  btnNewCluster:  $('btn-new-cluster'),
  btnClearHistory:$('btn-clear-history'),
  resultsLoading: $('results-loading'),
  resultsEmpty:   $('results-empty'),
  resultsError:   $('results-error'),
  errorMessage:   $('error-message'),
  tableView:      $('table-view'),
  jsonView:       $('json-view'),
  jsonContent:    $('json-content'),
  resultsThead:   $('results-thead'),
  resultsTbody:   $('results-tbody'),
  resultsCount:   $('results-count'),
  connDot:        $('conn-dot'),
  connStatus:     $('conn-status'),
  statusRows:     $('status-rows'),
  statusTime:     $('status-time'),
  statusAuthMethod: $('status-auth-method'),
  authMethodLabel:  $('auth-method-label'),
  clusterModal:   $('cluster-modal'),
  clusterModalTitle: $('cluster-modal-title'),
  modalError:     $('modal-error'),
  btnModalCancel: $('btn-modal-cancel'),
  btnModalTest:   $('btn-modal-test'),
  btnModalSave:   $('btn-modal-save'),
  deviceCodeBanner: $('device-code-banner'),
  deviceCodeText:   $('device-code-text'),
  toast:          $('toast'),
  runHint:        $('run-hint'),
};

// ── CodeMirror ─────────────────────────────────────────────────────────────
const editor = CodeMirror.fromTextArea($('query-editor'), {
  mode: 'text/x-sql',
  theme: 'default',
  lineNumbers: true,
  matchBrackets: true,
  lineWrapping: false,
  tabSize: 2,
  indentWithTabs: false,
  extraKeys: {
    'Ctrl-Enter': runQuery,
    'Cmd-Enter':  runQuery,
    'Ctrl-/':     (cm) => cm.toggleComment(),
  },
});
editor.setSize('100%', '100%');

// Fix hint: set OS-specific shortcut label
dom.runHint.textContent = navigator.platform.includes('Mac') ? '⌘↵' : 'Ctrl↵';

// ── Editor resize ──────────────────────────────────────────────────────────
(() => {
  const container = $('editor-container');
  const handle = $('editor-resize-handle');
  let dragging = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', (e) => {
    dragging = true; startY = e.clientY; startH = container.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const newH = Math.max(80, Math.min(window.innerHeight * 0.6, startH + (e.clientY - startY)));
    container.style.height = newH + 'px';
    editor.refresh();
  });
  document.addEventListener('mouseup', () => { dragging = false; document.body.style.cursor = ''; });
})();

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3000) {
  dom.toast.textContent = msg;
  dom.toast.className = `show ${type}`;
  clearTimeout(dom.toast._timer);
  dom.toast._timer = setTimeout(() => { dom.toast.className = ''; }, duration);
}

// ── Status bar ─────────────────────────────────────────────────────────────
function setStatus(text, dotClass = '') {
  dom.connStatus.textContent = text;
  dom.connDot.className = 'status-dot' + (dotClass ? ' ' + dotClass : '');
}

function updateAuthStatus() {
  if (!state.activeCluster) { dom.statusAuthMethod.style.display = 'none'; return; }
  const labels = { cli: 'Azure CLI', 'device-code': 'Device Code', 'app-registration': 'App Registration' };
  dom.authMethodLabel.textContent = labels[state.activeCluster.authMethod] || state.activeCluster.authMethod;
  dom.statusAuthMethod.style.display = 'flex';
}

// ── Cluster list render ────────────────────────────────────────────────────
function renderClusters() {
  if (!state.clusters.length) {
    dom.clusterList.innerHTML = '<div class="text-muted" style="padding:8px;font-size:11px;">No clusters added yet.</div>';
    return;
  }
  dom.clusterList.innerHTML = state.clusters.map(c => {
    const active = state.activeCluster?.id === c.id;
    return `
      <div class="cluster-item ${active ? 'active' : ''}" data-id="${c.id}">
        <div class="cluster-dot"></div>
        <div class="cluster-info">
          <div class="cluster-name">${esc(c.name)}</div>
          <div class="cluster-url">${esc(shortUrl(c.url))}</div>
        </div>
        <div class="cluster-actions">
          <button class="btn btn-icon" style="padding:2px 5px;" data-action="edit" data-id="${c.id}" title="Edit">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn-danger" style="padding:2px 5px;" data-action="delete" data-id="${c.id}" title="Delete">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

// ── History render ─────────────────────────────────────────────────────────
async function renderHistory() {
  if (!state.activeCluster) {
    dom.historyList.innerHTML = '<div class="text-muted" style="padding:8px;font-size:11px;">Select a cluster first.</div>';
    return;
  }
  const history = await window.adxAPI.getHistory(state.activeCluster.id);
  if (!history.length) {
    dom.historyList.innerHTML = '<div class="text-muted" style="padding:8px;font-size:11px;">No history yet.</div>';
    return;
  }
  dom.historyList.innerHTML = history.slice(0, 50).map(h => `
    <div class="history-item" data-query="${esc(h.query)}" title="${esc(h.query)}">
      <div class="history-query">${esc(h.query.slice(0, 60))}${h.query.length > 60 ? '…' : ''}</div>
      <div class="history-meta">${h.database ? esc(h.database) + ' · ' : ''}${h.rowCount ?? '?'} rows · ${fmtMs(h.executionTimeMs)}</div>
    </div>`).join('');
}

// ── Database select ────────────────────────────────────────────────────────
function renderDatabases() {
  dom.dbSelect.innerHTML = state.databases.length
    ? ['<option value="">— select database —', ...state.databases.map(d => `<option value="${esc(d)}"${d === state.activeDatabase ? ' selected' : ''}>${esc(d)}</option>`)].join('')
    : '<option value="">— no databases —</option>';
  if (state.activeDatabase) dom.dbSelect.value = state.activeDatabase;
}

async function loadDatabases(cluster) {
  dom.dbSelect.innerHTML = '<option value="">Loading…</option>';
  const res = await window.adxAPI.getDatabases({
    url: cluster.url, authMethod: cluster.authMethod, authConfig: cluster.authConfig || {}
  });
  if (res.success) {
    state.databases = res.databases;
    state.activeDatabase = cluster.defaultDatabase || res.databases[0] || '';
    renderDatabases();
    setStatus(`Connected · ${cluster.name}`, 'ok');
  } else {
    state.databases = [];
    dom.dbSelect.innerHTML = '<option value="">— failed to load —</option>';
    setStatus(`Error: ${res.error}`, 'error');
    showToast('Could not load databases: ' + res.error, 'error', 6000);
  }
}

// ── Select cluster ─────────────────────────────────────────────────────────
async function selectCluster(id) {
  const cluster = state.clusters.find(c => c.id === id);
  if (!cluster) return;
  state.activeCluster = cluster;
  renderClusters();
  updateAuthStatus();
  setStatus(`Connecting to ${cluster.name}…`, 'loading');
  await loadDatabases(cluster);
  renderHistory();
}

// ── Results display ────────────────────────────────────────────────────────
function showResults(data) {
  state.results = data;
  dom.resultsEmpty.style.display = 'none';
  dom.resultsError.classList.add('hidden');
  dom.resultsLoading.style.display = 'none';
  dom.btnExportCsv.disabled = false;
  dom.btnCopyResults.disabled = false;
  dom.resultsCount.textContent = `${data.rowCount} row${data.rowCount !== 1 ? 's' : ''}`;
  dom.statusRows.textContent = `${data.rowCount} rows`;
  dom.statusTime.textContent = data.executionTimeMs != null ? fmtMs(data.executionTimeMs) : '';
  renderTable(data);
  renderJson(data);
  switchTab(state.activeTab);
}

function showError(msg) {
  dom.resultsLoading.style.display = 'none';
  dom.resultsEmpty.style.display = 'none';
  dom.tableView.classList.add('hidden');
  dom.jsonView.style.display = 'none';
  dom.resultsError.classList.remove('hidden');
  dom.errorMessage.textContent = msg;
  dom.resultsCount.textContent = '';
}

function renderTable({ columns, rows }) {
  // Header
  dom.resultsThead.innerHTML = '<tr>' + columns.map(c => `
    <th data-col="${esc(c.name)}">
      <div class="th-inner">
        <span>${esc(c.name)}</span>
        <span class="th-type">${esc(c.type)}</span>
      </div>
    </th>`).join('') + '</tr>';

  // Body — render up to 5000 rows
  const limit = Math.min(rows.length, 5000);
  dom.resultsTbody.innerHTML = rows.slice(0, limit).map(row =>
    '<tr>' + columns.map(c => {
      const val = row[c.name];
      return `<td class="${cellClass(val, c.type)}">${cellText(val)}</td>`;
    }).join('') + '</tr>'
  ).join('');

  if (rows.length > 5000) showToast(`Showing first 5,000 of ${rows.length} rows`, 'info');
}

function renderJson({ rows }) {
  dom.jsonContent.textContent = JSON.stringify(rows, null, 2);
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.results-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  dom.tableView.classList.toggle('hidden', tab !== 'table');
  dom.jsonView.style.display = tab === 'json' ? 'block' : 'none';
}

// ── Run query ──────────────────────────────────────────────────────────────
async function runQuery() {
  const query = editor.getValue().trim();
  if (!query) { showToast('Query is empty', 'error'); return; }
  if (!state.activeCluster) { showToast('No cluster selected', 'error'); return; }
  const database = dom.dbSelect.value;
  if (!database) { showToast('Select a database first', 'error'); return; }

  dom.resultsEmpty.style.display = 'none';
  dom.resultsError.classList.add('hidden');
  dom.tableView.classList.add('hidden');
  dom.jsonView.style.display = 'none';
  dom.resultsLoading.style.display = 'flex';
  dom.btnRun.disabled = true;
  dom.btnExportCsv.disabled = true;
  dom.btnCopyResults.disabled = true;
  setStatus(`Running query on ${state.activeCluster.name}…`, 'loading');

  const res = await window.adxAPI.executeQuery({
    clusterId: state.activeCluster.id,
    url: state.activeCluster.url,
    database,
    query,
    authMethod: state.activeCluster.authMethod,
    authConfig: state.activeCluster.authConfig || {},
  });

  dom.btnRun.disabled = false;
  dom.resultsLoading.style.display = 'none';

  if (res.success) {
    setStatus(`Connected · ${state.activeCluster.name}`, 'ok');
    showResults(res);
    renderHistory();
  } else {
    setStatus(`Error · ${state.activeCluster.name}`, 'error');
    showError(res.error);
    showToast('Query failed', 'error');
  }
}

// ── Cluster modal ──────────────────────────────────────────────────────────
function openModal(cluster = null) {
  state.editingClusterId = cluster?.id || null;
  dom.clusterModalTitle.textContent = cluster ? 'Edit Cluster' : 'Add Cluster';
  $('input-cluster-name').value = cluster?.name || '';
  $('input-cluster-url').value  = cluster?.url  || '';
  $('input-default-db').value   = cluster?.defaultDatabase || '';
  dom.modalError.classList.add('hidden');
  dom.modalError.textContent = '';

  // Auth method
  const method = cluster?.authMethod || 'cli';
  setAuthTab(method);
  const cfg = cluster?.authConfig || {};
  $('input-cli-tenant').value   = (method === 'cli' ? cfg.tenantId : '') || '';
  $('input-dc-tenant').value    = cfg.tenantId || '';
  $('input-dc-client').value    = cfg.clientId || '';
  $('input-app-tenant').value   = cfg.tenantId || '';
  $('input-app-client').value   = cfg.clientId || '';
  $('input-app-secret').value   = cfg.clientSecret || '';

  dom.clusterModal.classList.remove('hidden');
  $('input-cluster-name').focus();
}

function closeModal() {
  dom.clusterModal.classList.add('hidden');
}

function setAuthTab(tab) {
  state.activeAuthTab = tab;
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.auth === tab));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  const panelId = 'auth-panel-' + tab;
  const panel = $(panelId);
  if (panel) panel.classList.add('active');
}

function getModalCluster() {
  const name = $('input-cluster-name').value.trim();
  const url  = $('input-cluster-url').value.trim();
  const defaultDatabase = $('input-default-db').value.trim();
  const authMethod = state.activeAuthTab;

  let authConfig = {};
  if (authMethod === 'cli') {
    authConfig = { tenantId: $('input-cli-tenant').value.trim() };
  } else if (authMethod === 'device-code') {
    authConfig = { tenantId: $('input-dc-tenant').value.trim(), clientId: $('input-dc-client').value.trim() };
  } else if (authMethod === 'app-registration') {
    authConfig = {
      tenantId: $('input-app-tenant').value.trim(),
      clientId: $('input-app-client').value.trim(),
      clientSecret: $('input-app-secret').value.trim(),
    };
  }

  return { name, url, defaultDatabase, authMethod, authConfig };
}

function validateModal(cluster) {
  if (!cluster.name) return 'Display name is required.';
  if (!cluster.url)  return 'Cluster URL is required.';
  if (!cluster.url.startsWith('https://')) return 'Cluster URL must start with https://';
  if (cluster.authMethod === 'app-registration') {
    if (!cluster.authConfig.tenantId) return 'Tenant ID is required for App Registration.';
    if (!cluster.authConfig.clientId) return 'Client ID is required for App Registration.';
    if (!cluster.authConfig.clientSecret) return 'Client Secret is required for App Registration.';
  }
  return null;
}

async function testConnection() {
  const cluster = getModalCluster();
  const err = validateModal(cluster);
  if (err) { dom.modalError.textContent = err; dom.modalError.classList.remove('hidden'); return; }

  dom.modalError.classList.add('hidden');
  dom.btnModalTest.disabled = true;
  dom.btnModalTest.textContent = 'Testing…';

  const res = await window.adxAPI.testConnection({
    url: cluster.url, authMethod: cluster.authMethod, authConfig: cluster.authConfig
  });

  dom.btnModalTest.disabled = false;
  dom.btnModalTest.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Test Connection`;

  if (res.success) {
    showToast('Connection successful!', 'success');
  } else {
    dom.modalError.textContent = 'Connection failed: ' + res.error;
    dom.modalError.classList.remove('hidden');
  }
}

async function saveCluster() {
  const cluster = getModalCluster();
  const err = validateModal(cluster);
  if (err) { dom.modalError.textContent = err; dom.modalError.classList.remove('hidden'); return; }

  if (state.editingClusterId) {
    await window.adxAPI.updateCluster({ ...cluster, id: state.editingClusterId });
  } else {
    await window.adxAPI.addCluster(cluster);
  }

  await reloadClusters();
  closeModal();
  showToast(state.editingClusterId ? 'Cluster updated' : 'Cluster added', 'success');
}

async function reloadClusters() {
  state.clusters = await window.adxAPI.getClusters();
  renderClusters();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function shortUrl(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function fmtMs(ms) {
  if (ms == null) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function cellClass(val, type) {
  if (val === null || val === undefined) return 'cell-null';
  const t = (type || '').toLowerCase();
  if (t.includes('int') || t.includes('long') || t.includes('real') || t.includes('decimal')) return 'cell-number';
  if (t.includes('bool')) return 'cell-bool';
  if (t.includes('datetime') || t.includes('timespan')) return 'cell-datetime';
  if (t.includes('dynamic') || typeof val === 'object') return 'cell-object';
  return '';
}

function cellText(val) {
  if (val === null || val === undefined) return '<span class="cell-null">null</span>';
  if (typeof val === 'object') return esc(JSON.stringify(val));
  return esc(String(val));
}

// ── Event wiring ───────────────────────────────────────────────────────────
dom.btnRun.addEventListener('click', runQuery);

dom.btnNewCluster.addEventListener('click', () => openModal());

dom.btnModalCancel.addEventListener('click', closeModal);
dom.btnModalTest.addEventListener('click', testConnection);
dom.btnModalSave.addEventListener('click', saveCluster);

dom.clusterModal.addEventListener('click', (e) => {
  if (e.target === dom.clusterModal) closeModal();
});

// Auth tabs in modal
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => setAuthTab(tab.dataset.auth));
});

// Results tabs
document.querySelectorAll('.results-tab').forEach(tab => {
  tab.addEventListener('click', () => { if (tab.dataset.tab) switchTab(tab.dataset.tab); });
});

// Cluster list clicks (delegation)
dom.clusterList.addEventListener('click', async (e) => {
  const editBtn   = e.target.closest('[data-action="edit"]');
  const deleteBtn = e.target.closest('[data-action="delete"]');
  const item      = e.target.closest('.cluster-item');

  if (editBtn) {
    e.stopPropagation();
    const cluster = state.clusters.find(c => c.id === editBtn.dataset.id);
    if (cluster) openModal(cluster);
  } else if (deleteBtn) {
    e.stopPropagation();
    if (confirm('Delete this cluster?')) {
      await window.adxAPI.deleteCluster(deleteBtn.dataset.id);
      if (state.activeCluster?.id === deleteBtn.dataset.id) {
        state.activeCluster = null;
        state.databases = [];
        renderDatabases();
        setStatus('No cluster selected', '');
        updateAuthStatus();
      }
      await reloadClusters();
      showToast('Cluster deleted', 'info');
    }
  } else if (item) {
    selectCluster(item.dataset.id);
  }
});

// History clicks
dom.historyList.addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (item) editor.setValue(item.dataset.query);
});

// Database select
dom.dbSelect.addEventListener('change', (e) => { state.activeDatabase = e.target.value; });

// Refresh databases
dom.btnRefreshDbs.addEventListener('click', () => {
  if (state.activeCluster) loadDatabases(state.activeCluster);
});

// Clear history
dom.btnClearHistory.addEventListener('click', async () => {
  if (!state.activeCluster) return;
  if (confirm('Clear query history for this cluster?')) {
    await window.adxAPI.clearHistory(state.activeCluster.id);
    renderHistory();
    showToast('History cleared', 'info');
  }
});

// Export CSV
dom.btnExportCsv.addEventListener('click', async () => {
  if (!state.results) return;
  const res = await window.adxAPI.exportCsv({ columns: state.results.columns, rows: state.results.rows });
  if (res.success) showToast('Exported to ' + res.filePath, 'success');
  else if (res.success === false && !res.filePath) {/* cancelled */}
});

// Copy results as JSON
dom.btnCopyResults.addEventListener('click', () => {
  if (!state.results) return;
  navigator.clipboard.writeText(JSON.stringify(state.results.rows, null, 2));
  showToast('Copied to clipboard', 'success');
});

// Device code banner
window.adxAPI.onDeviceCodeMessage((msg) => {
  dom.deviceCodeText.textContent = msg;
  dom.deviceCodeBanner.classList.add('visible');
});

// Table header sort
$('results-table').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-col]');
  if (!th || !state.results) return;
  const col = th.dataset.col;
  if (state.sortCol === col) state.sortDir *= -1;
  else { state.sortCol = col; state.sortDir = 1; }
  const sorted = [...state.results.rows].sort((a, b) => {
    const av = a[col], bv = b[col];
    if (av == null) return 1; if (bv == null) return -1;
    return av < bv ? -state.sortDir : av > bv ? state.sortDir : 0;
  });
  renderTable({ columns: state.results.columns, rows: sorted });
});

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  await reloadClusters();
  if (state.clusters.length > 0) {
    // Auto-select the most recently used cluster
    const sorted = [...state.clusters].sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
    selectCluster(sorted[0].id);
  }
})();
