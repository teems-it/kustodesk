// tests/e2e/helpers/mock-kusto-server.js
// Dependency-free HTTP server impersonating the Kusto REST API (spec 0005).
//
// REST contract verified from node_modules/azure-kusto-data v6.0.3 source:
//   - Before every execute, the SDK issues GET {cluster}/v1/rest/auth/metadata
//     (per-cluster cached; a 404 also falls back to the default cloud info) and
//     then validates the target hostname is trusted — loopback hosts
//     (127.0.0.1/localhost/::1) are unconditionally trusted, so the app can
//     connect to http://127.0.0.1:<port> like a real cluster.
//   - Queries go to POST /v2/rest/query with body { db, csl } and are parsed by
//     KustoResponseDataSetV2 — an array of frames; the primary table is the
//     DataTable frame whose TableKind is "PrimaryResult".
//   - Management commands go to POST /v1/rest/mgmt with body { db, csl } and are
//     parsed by KustoResponseDataSetV1 — { Tables: [...] }; a single table
//     without TableKind defaults to the primary result.
//   - Only HTTP 200 is treated as success (validateStatus); any other status
//     raises an axios error whose response.data carries the Kusto error body —
//     a plain string or { error: { "@message" } } (both understood by the app's
//     describeKustoError).
//   - Columns are { ColumnName, ColumnType }; rows are arrays ordered by column
//     ordinal; the SDK's table.rows() is a GENERATOR yielding KustoResultRow —
//     iterate it (never index) and use row.toJSON().

import http from 'node:http';

// Default dataset comes from the fixtures module (spec 0005 Task 3) — the
// single source of truth shared with the test assertions. Scenarios that
// need custom responses still pass their own `dataset` option.
import { defaultDataset } from '../fixtures/kusto-fixtures.js';

const AUTH_METADATA_PATH = '/v1/rest/auth/metadata';
const QUERY_PATH = '/v2/rest/query';
const MGMT_PATH = '/v1/rest/mgmt';


// Response the SDK's CloudSettings expects (reads response.data.AzureAD).
// Values mirror cloudSettings.js defaultCloudInfo — enough for the SDK to
// proceed; the mock never validates a token, so nothing real is contacted.
function authMetadataBody() {
  return {
    AzureAD: {
      LoginEndpoint: 'https://login.microsoftonline.com',
      LoginMfaRequired: false,
      KustoClientAppId: 'db662dc1-0cfe-4e1c-a843-19a68e65be58',
      KustoClientRedirectUri: 'https://microsoft/kustoclient',
      KustoServiceResourceId: 'https://kusto.kusto.windows.net',
      FirstPartyAuthorityUrl:
        'https://login.microsoftonline.com/f8cdef31-a31e-4b4a-93e4-5f571e91255a',
    },
  };
}

// V2 query envelope (frames array) for a successful primary result.
// columns: [{ name, type }], rows: array of plain objects keyed by column name.
function queryEnvelopeV2({ columns, rows, name = 'PrimaryResult' }) {
  return [
    {
      FrameType: 'DataSetHeader',
      IsProgressive: false,
      Version: '2.0',
    },
    {
      FrameType: 'DataTable',
      TableId: 0,
      TableKind: 'PrimaryResult',
      TableName: name,
      Columns: columns.map((c) => ({ ColumnName: c.name, ColumnType: c.type })),
      Rows: rows.map((row) => columns.map((c) => row[c.name])),
    },
  ];
}

// V1 mgmt envelope ({ Tables: [...] }) for a successful single-table result.
// No TableKind: the V1 deserializer defaults a lone table to the primary result.
function mgmtEnvelopeV1({ columns, rows, name = 'Table_0' }) {
  return {
    Tables: [
      {
        TableName: name,
        TableId: 0,
        Columns: columns.map((c) => ({ ColumnName: c.name, ColumnType: c.type })),
        Rows: rows.map((row) => columns.map((c) => row[c.name])),
      },
    ],
  };
}

// Kusto-style error body understood by the app's describeKustoError
// (data.error['@message'] || data.error.message).
function kustoErrorBody(message, code = 'General_BadRequest') {
  return {
    error: {
      '@type': 'Kusto.DataNode.Exceptions.QueryExecutionException',
      '@message': message,
      '@permanent': true,
      code,
    },
  };
}

// A dataset entry is either a success spec ({ columns, rows }) served as
// envelope for its endpoint, an error spec ({ error: { message, code } })
// served with an HTTP error status, or a function (db, csl) => entry that
// decides dynamically (e.g. the SYN0002-style failure scenario).
function resolveEntry(entry, db, csl) {
  return typeof entry === 'function' ? entry(db, csl) : entry;
}

class MockKustoServer {
  /**
   * @param {object} options
   * @param {{ queries?: Record<string, object>, mgmt?: Record<string, object> }} [options.dataset]
   *        Maps command text (trimmed csl) to a success/error spec. Dispatches
   *        on the literal command text — the mock does not evaluate KQL.
   *        Defaults to the fixture dataset (tests/e2e/fixtures/kusto-fixtures.js).
   */
  constructor({ dataset = defaultDataset() } = {}) {
    this.dataset = dataset;
    // Every received command, in order: { path, db, csl, authorization }
    // (authorization kept raw so tests can assert a Bearer token was sent).
    this.received = [];
    this.server = http.createServer((req, res) => this._dispatch(req, res));
  }

  get url() {
    const addr = this.server.address();
    return `http://127.0.0.1:${addr.port}`;
  }

  start() {
    return new Promise((resolve, reject) => {
      // Ephemeral port on the loopback interface — like the real cluster URL
      // the app is pointed at (see spec 0005).
      this.server.listen(0, '127.0.0.1', () => resolve());
      this.server.once('error', reject);
    });
  }

  async stop() {
    // The SDK's axios instance uses keepAlive agents — close idle/active
    // sockets so vitest doesn't hang on the open handle.
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }

  clearReceived() {
    this.received.length = 0;
  }

  _send(res, status, body) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  async _dispatch(req, res) {
    try {
      if (req.method === 'GET' && req.url === AUTH_METADATA_PATH) {
        this._send(res, 200, authMetadataBody());
        return;
      }

      if (req.method !== 'POST' || (req.url !== QUERY_PATH && req.url !== MGMT_PATH)) {
        this._send(res, 404, kustoErrorBody(
          `E2E_MOCK: unknown endpoint ${req.method} ${req.url}`, 'EndpointNotFound'));
        return;
      }

      const body = await this._readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        this._send(res, 400, kustoErrorBody('E2E_MOCK: request body is not valid JSON'));
        return;
      }

      const db = parsed.db == null ? '' : String(parsed.db);
      const csl = typeof parsed.csl === 'string' ? parsed.csl.trim() : '';
      const auth = req.headers.authorization;
      this.received.push({
        path: req.url,
        db,
        csl,
        authorization: typeof auth === 'string' ? auth : null,
      });

      const table = req.url === QUERY_PATH ? this.dataset.queries : this.dataset.mgmt;
      const entry = table && Object.prototype.hasOwnProperty.call(table, csl)
        ? resolveEntry(table[csl], db, csl)
        : undefined;

      if (!entry) {
        this._send(res, 400, kustoErrorBody(
          `E2E_MOCK: unknown ${req.url === QUERY_PATH ? 'query' : 'command'}: ${csl}`));
        return;
      }

      if (entry.error) {
        const status = entry.error.status || 400;
        this._send(res, status, kustoErrorBody(entry.error.message, entry.error.code));
        return;
      }

      const envelope = req.url === QUERY_PATH
        ? queryEnvelopeV2(entry)
        : mgmtEnvelopeV1(entry);
      this._send(res, 200, envelope);
    } catch (err) {
      // Defensive: never let the mock crash on a malformed request.
      this._send(res, 500, kustoErrorBody(`E2E_MOCK: internal error: ${err && err.message}`));
    }
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
}

/**
 * Creates and starts a mock Kusto server on an ephemeral loopback port.
 * Returns { server, url, received, clearReceived, stop }.
 * Bearer tokens are accepted and ignored — no AAD validation happens.
 */
export async function startMockKustoServer(options) {
  const server = new MockKustoServer(options);
  await server.start();
  return {
    server,
    url: () => server.url,
    received: server.received,
    clearReceived: () => server.clearReceived(),
    stop: () => server.stop(),
  };
}

export {
  MockKustoServer,
  AUTH_METADATA_PATH,
  QUERY_PATH,
  MGMT_PATH,
  authMetadataBody,
  queryEnvelopeV2,
  mgmtEnvelopeV1,
  kustoErrorBody,
};

