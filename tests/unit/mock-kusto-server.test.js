// tests/unit/mock-kusto-server.test.js
// Task 1 of spec 0005: pin the mock server's payload fidelity against the REAL
// azure-kusto-data deserializers (KustoResponseDataSetV2/V1) and the REAL
// Client over actual HTTP against the mock — so the E2E mock can never drift
// from the SDK contract (the 0003 generator-rows() lesson).
import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { KustoResponseDataSetV2 } = require('azure-kusto-data/dist-esm/src/response.js');
const { KustoResponseDataSetV1 } = require('azure-kusto-data/dist-esm/src/response.js');
// describeKustoError proves the mock's error body shape is exactly what the
// app surfaces to users.
const { describeKustoError } = require('../../src/main/kusto-client');
const {
  MockKustoServer,
  QUERY_PATH,
  MGMT_PATH,
  queryEnvelopeV2,
  mgmtEnvelopeV1,
  kustoErrorBody,
  startMockKustoServer,
} = await import('../e2e/helpers/mock-kusto-server.js');

const QUERY_COLUMNS = [
  { name: 'EventId', type: 'long' },
  { name: 'State', type: 'string' },
];
const QUERY_ROWS = [
  { EventId: 1, State: 'TEXAS' },
  { EventId: 2, State: 'KANSAS' },
];

// Iterate rows() the ONLY correct way — the generator-rows() lesson of
// 0003 bugfix #3 (rows()[0] is undefined).
function rowsToJson(table) {
  const out = [];
  for (const row of table.rows()) out.push(row.toJSON());
  return out;
}

describe('queryEnvelopeV2 fidelity (real KustoResponseDataSetV2)', () => {
  it('deserializes into a primary result whose generator rows match the fixture', () => {
    const envelope = queryEnvelopeV2({ columns: QUERY_COLUMNS, rows: QUERY_ROWS });
    const parsed = new KustoResponseDataSetV2(envelope);

    expect(parsed.version).toBe('2.0');
    expect(parsed.primaryResults).toHaveLength(1);
    expect(parsed.getErrorsCount().errors).toBe(0);

    const table = parsed.primaryResults[0];
    expect(table.name).toBe('PrimaryResult');
    expect(table.columns.map((c) => ({ name: c.name, type: c.type })))
      .toEqual(QUERY_COLUMNS);
    // rows() is a generator — never index it
    const iter = table.rows();
    expect(typeof iter[Symbol.iterator]).toBe('function');
    expect(rowsToJson(table)).toEqual(QUERY_ROWS);
  });

  it('produces frames matching the wire shape the SDK expects (DataTable + DataSetHeader)', () => {
    const envelope = queryEnvelopeV2({ columns: QUERY_COLUMNS, rows: QUERY_ROWS });
    expect(envelope[0].FrameType).toBe('DataSetHeader');
    expect(envelope[1].FrameType).toBe('DataTable');
    expect(envelope[1].TableKind).toBe('PrimaryResult');
    expect(envelope[1].Columns).toEqual([
      { ColumnName: 'EventId', ColumnType: 'long' },
      { ColumnName: 'State', ColumnType: 'string' },
    ]);
    expect(envelope[1].Rows).toEqual([[1, 'TEXAS'], [2, 'KANSAS']]);
  });
});


describe('mgmtEnvelopeV1 fidelity (real KustoResponseDataSetV1)', () => {
  it('deserializes a lone table into the primary result (kind defaulted, rows generator)', () => {
    const envelope = mgmtEnvelopeV1({
      columns: [{ name: 'TableName', type: 'string' }],
      rows: [{ TableName: 'StormEvents' }],
    });
    const parsed = new KustoResponseDataSetV1(envelope);

    expect(parsed.version).toBe('1.0');
    expect(parsed.primaryResults).toHaveLength(1);
    expect(parsed.primaryResults[0].kind).toBe('PrimaryResult');
    expect(rowsToJson(parsed.primaryResults[0])).toEqual([{ TableName: 'StormEvents' }]);
    expect(parsed.getErrorsCount().errors).toBe(0);
  });

  it('deserializes a schema-JSON single-row mgmt result the way the app consumes it', () => {
    // Matches _fetchDatabaseSchemaNode: one row, first column = schema JSON string.
    const schemaJson = JSON.stringify({
      Databases: {
        TestDB: {
          Name: 'TestDB',
          Tables: { StormEvents: { OrderedColumns: ['EventId', 'State'] } },
          MaterializedViews: { StormEventsByState: { OrderedColumns: ['State'] } },
        },
      },
    });
    const envelope = mgmtEnvelopeV1({
      columns: [{ name: 'DatabaseSchema', type: 'string' }],
      rows: [{ DatabaseSchema: schemaJson }],
    });
    const parsed = new KustoResponseDataSetV1(envelope);

    const schema = JSON.parse(rowsToJson(parsed.primaryResults[0])[0].DatabaseSchema);
    expect(schema.Databases.TestDB.Tables).toHaveProperty('StormEvents');
    expect(schema.Databases.TestDB.MaterializedViews).toHaveProperty('StormEventsByState');
  });
});


describe('MockKustoServer over real HTTP (real SDK Client)', () => {
  // One server shared by this suite; the SDK caches cloud metadata per URL,
  // so a stable url() across tests mirrors real app usage.
  const mock = startMockKustoServer({
    dataset: {
      queries: {
        'StormEvents | take 3': {
          columns: QUERY_COLUMNS,
          rows: [
            { EventId: 1, State: 'TEXAS' },
            { EventId: 2, State: 'KANSAS' },
            { EventId: 3, State: 'IOWA' },
          ],
        },
      },
      mgmt: {
        '.show tables': {
          columns: [{ name: 'TableName', type: 'string' }],
          rows: [{ TableName: 'StormEvents' }],
        },
        '.show materialized views': {
          // error entries serve a Kusto-style HTTP error (SYN0002-style scenario)
          error: { message: 'SYN0002: malformed query', code: 'SemanticErrors' },
        },
      },
    },
  });

  afterAll(async () => {
    const m = await mock;
    await m.stop();
  });

  it('serves a query the real Client parses into fixture rows; records the received command', async () => {
    const { url, received } = await mock;
    const { Client, KustoConnectionStringBuilder } = require('azure-kusto-data');
    const client = new Client(KustoConnectionStringBuilder.withTokenProvider(
      url(), async () => 'e2e-token'));

    try {
      const results = await client.execute('TestDB', 'StormEvents | take 3');
      expect(results.primaryResults).toHaveLength(1);
      expect(rowsToJson(results.primaryResults[0])).toEqual([
        { EventId: 1, State: 'TEXAS' },
        { EventId: 2, State: 'KANSAS' },
        { EventId: 3, State: 'IOWA' },
      ]);
    } finally {
      client.close();
    }

    const rec = received.find((r) => r.path === QUERY_PATH);
    expect(rec).toBeDefined();
    expect(rec.db).toBe('TestDB');
    expect(rec.csl).toBe('StormEvents | take 3');
    expect(rec.authorization).toMatch(/^Bearer /);
  });

  it('serves mgmt commands and ignores the bearer token; unknown commands get a Kusto error', async () => {
    const { url, received } = await mock;
    const { Client, KustoConnectionStringBuilder } = require('azure-kusto-data');
    const client = new Client(KustoConnectionStringBuilder.withTokenProvider(
      url(), async () => 'garbage-not-a-real-token'));

    try {
      const results = await client.executeMgmt('TestDB', '.show tables');
      expect(rowsToJson(results.primaryResults[0])).toEqual([{ TableName: 'StormEvents' }]);

      // unknown command → 400 with the Kusto error body the app understands
      let caught;
      try {
        await client.executeMgmt('TestDB', '.show this-does-not-exist');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      expect(caught.response.status).toBe(400);
      expect(describeKustoError(caught)).toContain('unknown command: .show this-does-not-exist');
    } finally {
      client.close();
    }

    expect(received.find((r) => r.path === MGMT_PATH && r.csl === '.show tables'))
      .toMatchObject({ db: 'TestDB', authorization: 'Bearer garbage-not-a-real-token' });
  });

  it('serves dataset-configured errors surfaced through describeKustoError', async () => {
    const { url } = await mock;
    const { Client, KustoConnectionStringBuilder } = require('azure-kusto-data');
    const client = new Client(KustoConnectionStringBuilder.withTokenProvider(
      url(), async () => 'e2e-token'));

    let caught;
    try {
      await client.executeMgmt('TestDB', '.show materialized views');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.response.status).toBe(400);
    expect(describeKustoError(caught)).toBe('SYN0002: malformed query');
    client.close();
  });

  it('answers the SDK cloud-metadata GET the real Client performs before executing', async () => {
    const { url } = await mock;
    const res = await fetch(`${url()}/v1/rest/auth/metadata`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.AzureAD).toMatchObject({ LoginEndpoint: 'https://login.microsoftonline.com' });
  });
});

describe('startMockKustoServer convenience wrapper', () => {
  it('starts on an ephemeral loopback port and stops cleanly', async () => {
    const m = await startMockKustoServer();
    const theUrl = m.url();
    expect(theUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await m.stop();
    await expect(fetch(`${theUrl}/v1/rest/auth/metadata`)).rejects.toThrow();
  });

  it('rejects non-Kusto endpoints with a 404 Kusto error body', async () => {
    const server = new MockKustoServer();
    await server.start();
    try {
      const res = await fetch(`${server.url}/v1/rest/ingest`, { method: 'POST', body: '{}' });
      expect(res.status).toBe(404);
      expect((await res.json()).error['@message']).toContain('unknown endpoint');
    } finally {
      await server.stop();
    }
  });
});

