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
      case 'cli':
        // Built-in az login support — no @azure/identity needed
        return KustoConnectionStringBuilder.withAzLoginIdentity(url);

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
        return KustoConnectionStringBuilder.withAzLoginIdentity(url);
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

  async testConnection(url, authMethod, authConfig, onDeviceCodeMessage) {
    await this.getDatabases(url, authMethod, authConfig, onDeviceCodeMessage);
    return true;
  }
}

module.exports = { KustoClientManager };
