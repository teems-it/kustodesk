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

  // Fallback for clusters that reject `.show materialized views` outright (observed:
  // 400 General_BadRequest cluster-wide on a modern engine) — the database schema
  // JSON carries the same MaterializedViews map and is known to work there.
  async _showMaterializedViewsViaSchema(client, database) {
    const dbNode = await this._fetchDatabaseSchemaNode(client, database);
    return Object.keys(dbNode.MaterializedViews || {});
  }

  // Fetch and parse the database schema JSON down to the requested database node
  // (falls back to the first database when the name differs — some engines
  // return a different name/casing than the one requested).
  async _fetchDatabaseSchemaNode(client, database) {
    const results = await client.executeMgmt(database, '.show database schema as json');
    // rows() is a GENERATOR on real KustoResultTables (models.js `*rows()`) —
    // it must be iterated, not indexed (rows()[0] is undefined on generators).
    let schemaJson;
    for (const row of results.primaryResults[0].rows()) {
      schemaJson = Object.values(row.toJSON())[0];
      break; // single-row result
    }
    const schema = typeof schemaJson === 'string' ? JSON.parse(schemaJson) : schemaJson;
    return (schema && schema.Databases && (schema.Databases[database] || Object.values(schema.Databases)[0])) || {};
  }

  // Column names from a schema-JSON table/MV node. The real payload carries an
  // OrderedColumns string array, but tolerate columns-as-object-array and
  // columns-as-object shapes so odd engine variants never break completion.
  _normalizeColumns(node) {
    if (!node || typeof node !== 'object') return [];
    const cols = node.OrderedColumns !== undefined ? node.OrderedColumns : node.Columns;
    if (Array.isArray(cols)) {
      return cols
        .map((c) => (typeof c === 'string' ? c : c && (c.Name || c.ColumnName)))
        .filter(Boolean);
    }
    if (cols && typeof cols === 'object') return Object.keys(cols);
    return [];
  }

  // Full column schema of a database for the IntelliSense engine (spec 0004):
  // a single schema-JSON mgmt call parsed into maps of resource name → ordered
  // column-name list (empty objects when none exist).
  async getSchema(url, database, authMethod, authConfig, onDeviceCodeMessage) {
    // Nothing selected — short-circuit without creating a client or any mgmt call
    if (!database) return { tables: {}, materializedViews: {} };

    try {
      const client = this._getOrCreateClient(url, authMethod, authConfig, onDeviceCodeMessage);
      const dbNode = await this._fetchDatabaseSchemaNode(client, database);

      const tables = {};
      for (const [name, node] of Object.entries(dbNode.Tables || {})) {
        tables[name] = this._normalizeColumns(node);
      }
      const materializedViews = {};
      for (const [name, node] of Object.entries(dbNode.MaterializedViews || {})) {
        materializedViews[name] = this._normalizeColumns(node);
      }
      return { tables, materializedViews };
    } catch (err) {
      throw new Error(describeKustoError(err));
    }
  }

  async getResources(url, database, authMethod, authConfig, onDeviceCodeMessage) {
    // Nothing selected — short-circuit without creating a client or any mgmt call
    if (!database) return { tables: [], materializedViews: [] };

    const client = this._getOrCreateClient(url, authMethod, authConfig, onDeviceCodeMessage);

    // Both are database-scoped management commands — must use executeMgmt.
    // Fetched independently: some clusters reject `.show materialized views` outright
    // (400 General_BadRequest), and that must not kill the table listing.
    const [tablesRes, viewsRes] = await Promise.allSettled([
      client.executeMgmt(database, '.show tables'),
      client.executeMgmt(database, '.show materialized views'),
    ]);

    if (tablesRes.status === 'rejected') {
      throw new Error(describeKustoError(tablesRes.reason));
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
    } else {
      // `.show materialized views` failed — try the schema-JSON fallback before giving up
      try {
        const viaSchema = await this._showMaterializedViewsViaSchema(client, database);
        materializedViews.push(...viaSchema);
      } catch (fallbackErr) {
        console.warn(
          `[kusto] materialized-view listing failed (returning empty list): ` +
            `'.show materialized views': ${describeKustoError(viewsRes.reason)}; ` +
            `'.show database schema as json': ${describeKustoError(fallbackErr)}`
        );
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
