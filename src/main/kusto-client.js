// src/main/kusto-client.js
// Manages Kusto client instances and authentication methods
//
// Real azure-kusto-data v6 API (verified from source):
//   - Export is `Client` aliased as KustoClient in the index? Actually index exports Client.
//   - KCSB methods: withAzLoginIdentity, withAadDeviceAuthentication, withAadApplicationKeyAuthentication, withTokenCredential
//   - Rows accessed via table.rows() iterator → row.toJSON()
//   - Management commands (.show ...) must use client.executeMgmt()

const {
  Client: KustoClient,
  KustoConnectionStringBuilder,
} = require('azure-kusto-data');

class KustoClientManager {
  constructor() {
    // Cache clients by a composite key (url + authMethod + configHash)
    this.clients = new Map();
  }

  _buildKcsb(url, authMethod, authConfig = {}, onDeviceCodeMessage) {
    switch (authMethod) {
      case 'cli': {
        // Directly invoke `az account get-access-token` — identical to what works in terminal.
        // withAzLoginIdentity uses @azure/identity internally which misbehaves in Electron
        // (wrong resource scope, PATH issues, tenant resolution). This is the reliable fallback.
        const { execSync } = require('child_process');

        const tokenCallback = async () => {
          const tenantArg = authConfig.tenantId ? `--tenant ${authConfig.tenantId}` : '';
          // Request a token scoped to the Kusto service (public Azure cloud)
          const cmd = `az account get-access-token --resource https://kusto.kusto.windows.net ${tenantArg} --output json`;
          try {
            const out = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
            const data = JSON.parse(out);
            return data.accessToken;
          } catch (err) {
            throw new Error(`az CLI token acquisition failed: ${err.message || err}`);
          }
        };

        // withTokenProvider calls our callback each time a token is needed (handles refresh)
        return KustoConnectionStringBuilder.withTokenProvider(url, tokenCallback);
      }

      case 'device-code':
        // Built-in device code flow with optional callback
        return KustoConnectionStringBuilder.withAadDeviceAuthentication(
          url,
          authConfig.tenantId || undefined,
          onDeviceCodeMessage || undefined
        );

      case 'app-registration':
        // Client credentials (app registration with secret)
        return KustoConnectionStringBuilder.withAadApplicationKeyAuthentication(
          url,
          authConfig.clientId,
          authConfig.clientSecret,
          authConfig.tenantId
        );

      default:
        throw new Error(`Unknown auth method: ${authMethod}`);
    }
  }

  _clientKey(url, authMethod, authConfig = {}) {
    const suffix =
      authMethod === 'app-registration'
        ? `${authConfig.tenantId}:${authConfig.clientId}`
        : authMethod;
    return `${url}::${suffix}`;
  }

  _getOrCreateClient(url, authMethod, authConfig, onDeviceCodeMessage) {
    // Device code clients must not be cached (fresh callback each time)
    if (authMethod !== 'device-code') {
      const key = this._clientKey(url, authMethod, authConfig);
      if (this.clients.has(key)) return this.clients.get(key);
    }

    const kcsb = this._buildKcsb(url, authMethod, authConfig, onDeviceCodeMessage);
    const client = new KustoClient(kcsb);

    if (authMethod !== 'device-code') {
      const key = this._clientKey(url, authMethod, authConfig);
      this.clients.set(key, client);
    }

    return client;
  }

  // Invalidate cached client (e.g. after credential change)
  invalidate(url, authMethod, authConfig) {
    const key = this._clientKey(url, authMethod, authConfig);
    this.clients.delete(key);
  }

  async execute(url, database, query, authMethod, authConfig, onDeviceCodeMessage) {
    const client = this._getOrCreateClient(url, authMethod, authConfig, onDeviceCodeMessage);
    const results = await client.execute(database, query);

    const primaryTable = results.primaryResults[0];
    const columns = primaryTable.columns.map((c) => ({
      name: c.name,
      type: c.columnType || 'dynamic',
    }));

    // Use the SDK's rows() iterator + toJSON() — the correct v6 API
    const rows = [];
    for (const row of primaryTable.rows()) {
      rows.push(row.toJSON());
    }

    return { columns, rows, rowCount: rows.length };
  }

  async getDatabases(url, authMethod, authConfig, onDeviceCodeMessage) {
    const client = this._getOrCreateClient(url, authMethod, authConfig, onDeviceCodeMessage);
    // .show databases is a management command — must use executeMgmt
    const results = await client.executeMgmt('', '.show databases');
    const dbs = [];
    for (const row of results.primaryResults[0].rows()) {
      const r = row.toJSON();
      if (r.DatabaseName) dbs.push(r.DatabaseName);
    }
    return dbs;
  }

  async getResources(url, database, authMethod, authConfig, onDeviceCodeMessage) {
    // Nothing selected — short-circuit without creating a client or any mgmt call
    if (!database) return { tables: [], materializedViews: [] };

    const client = this._getOrCreateClient(url, authMethod, authConfig, onDeviceCodeMessage);

    // Both are database-scoped management commands — must use executeMgmt.
    // Fetched independently: some clusters reject `.show materialized views` outright
    // (400 General_BadRequest on engines without MV support), and that must not kill
    // the table listing.
    const [tablesRes, viewsRes] = await Promise.allSettled([
      client.executeMgmt(database, '.show tables'),
      client.executeMgmt(database, '.show materialized views'),
    ]);

    if (tablesRes.status === 'rejected') {
      throw new Error(describeKustoError(tablesRes.reason));
    }

    if (viewsRes.status === 'rejected') {
      // Degrade gracefully: no MV listing, but the tables still render
      console.warn(`[kusto] '.show materialized views' failed (returning empty list): ${describeKustoError(viewsRes.reason)}`);
    }

    const tables = [];
    for (const row of tablesRes.value.primaryResults[0].rows()) {
      const r = row.toJSON();
      if (r.TableName) tables.push(r.TableName);
    }

    const materializedViews = [];
    if (viewsRes.status === 'fulfilled') {
      for (const row of viewsRes.value.primaryResults[0].rows()) {
        const r = row.toJSON();
        if (r.Name) materializedViews.push(r.Name);
      }
    }

    return { tables, materializedViews };
  }

  async testConnection(url, authMethod, authConfig, onDeviceCodeMessage) {
    await this.getDatabases(url, authMethod, authConfig, onDeviceCodeMessage);
    return true;
  }
}

// Extract the useful message from an SDK/axios error. Kusto returns its real error
// description in the HTTP response body — either as a plain string
// ("General_BadRequest: ...") or as an object ({ error: { "@message": ... } }) —
// while err.message alone is the generic axios "Request failed with status code N".
function describeKustoError(err) {
  const data = err && err.response && err.response.data;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object') {
    const msg =
      (data.error && (data.error['@message'] || data.error.message)) ||
      data['@message'] ||
      data.message;
    if (msg) return String(msg);
  }
  return (err && err.message) || String(err);
}

module.exports = { KustoClientManager, describeKustoError };
