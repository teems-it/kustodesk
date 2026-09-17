// tests/e2e/fixtures/kusto-fixtures.js
// Spec 0005 Task 3: the SINGLE SOURCE OF TRUTH for the mocked-ADX E2E suite.
// Every fixture value here is used both by the mock server's responses AND by
// the test assertions (unit fidelity tests today, E2E scenarios from Task 4 on).
//
// Fidelity rules learned in Task 1 (keep them or the deserializers drift):
//   - Column types use real Kusto scalar names ('long', 'string', 'real',
//     'datetime', ...). The SDK's KustoResultRow converts ONLY 'datetime'
//     (→ Date) and 'timespan' (→ ms number) values; everything else —
//     including nulls — passes through untouched (models.js v6.0.3).
//   - Query-result rows therefore deliberately avoid datetime/timespan
//     columns so E2E cell/JSON/CSV assertions stay deterministic across
//     timezones. StartTime lives in the table SCHEMA below for IntelliSense
//     coverage but never in served result rows.
//   - Mgmt row column names match what the app reads: DatabaseName
//     (getDatabases), TableName (.show tables), Name (.show materialized
//     views), and the single-row schema-JSON payload (see kusto-client.js).

// ---------------------------------------------------------------------------
// Cluster
// ---------------------------------------------------------------------------

// The E2E cluster always connects with the KUSTODESK_E2E_TOKEN seam
// (Task 2), so the authMethod below is intentionally a real mode that would
// otherwise shell out to `az` — this proves the seam overrides it in the
// full app, not just in unit tests.
export const CLUSTER_NAME = 'E2E Mock Cluster';
export const AUTH_METHOD = 'cli';

// URL is runtime (ephemeral mock port) — built per launch via this factory.
export function clusterDefinition(url) {
  return {
    name: CLUSTER_NAME,
    url,
    authMethod: AUTH_METHOD,
    authConfig: {},
  };
}

// ---------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------

export const DATABASE = 'TestDB';
// Two databases so the dropdown-population scenario asserts real content,
// not just a single-item degenerate case.
export const DATABASES = ['TestDB', 'AuxDB'];

// ---------------------------------------------------------------------------
// Table + materialized view
// ---------------------------------------------------------------------------

export const TABLE_NAME = 'StormEvents';
export const MV_NAME = 'StormEventsByState';

// Full table schema (used by the schema-JSON node → IntelliSense + sidebar).
export const TABLE_COLUMNS = [
  { name: 'EventId', type: 'long' },
  { name: 'StartTime', type: 'datetime' },
  { name: 'State', type: 'string' },
  { name: 'DamageCrops', type: 'real' },
];

export const MV_COLUMNS = [
  { name: 'State', type: 'string' },
  { name: 'EventCount', type: 'long' },
];

// ---------------------------------------------------------------------------
// Query results
// ---------------------------------------------------------------------------

// The canonical user-typed query (spec scenario 5): Run Query → fixture rows.
export const TAKE_QUERY = 'StormEvents | take 3';
export const TAKE_QUERY_COLUMNS = [
  { name: 'EventId', type: 'long' },
  { name: 'State', type: 'string' },
  { name: 'DamageCrops', type: 'real' },
];
export const TAKE_QUERY_ROWS = [
  { EventId: 1, State: 'TEXAS', DamageCrops: 0 },
  { EventId: 2, State: 'KANSAS', DamageCrops: 1234.5 },
  { EventId: 3, State: 'IOWA', DamageCrops: null },
];

// The context-menu insert query from 0003: right-clicking TABLE_NAME inserts
// exactly this text (["Name"] | take 100) at the cursor.
export const CONTEXT_MENU_QUERY = `["${TABLE_NAME}"] | take 100`;
export const CONTEXT_MENU_QUERY_COLUMNS = TAKE_QUERY_COLUMNS;
export const CONTEXT_MENU_QUERY_ROWS = TAKE_QUERY_ROWS;

// A query the mock fails with a Kusto error body (spec scenario 6). Text
// mirrors a realistic semantic error a user could hit.
export const FAILING_QUERY = 'StormEvents | where Disaster == true';
export const QUERY_ERROR = {
  status: 400,
  code: 'SEM0100',
  message: "SEM0100: 'Disaster' is not a recognized column in table 'StormEvents'",
};

// ---------------------------------------------------------------------------
// Mgmt command results
// ---------------------------------------------------------------------------

export const SHOW_DATABASES_COLUMNS = [{ name: 'DatabaseName', type: 'string' }];
export const SHOW_DATABASES_ROWS = DATABASES.map((db) => ({ DatabaseName: db }));

export const SHOW_TABLES_COLUMNS = [{ name: 'TableName', type: 'string' }];
export const SHOW_TABLES_ROWS = [{ TableName: TABLE_NAME }];

export const SHOW_MV_COLUMNS = [{ name: 'Name', type: 'string' }];
export const SHOW_MV_ROWS = [{ Name: MV_NAME }];

export const SCHEMA_JSON_COLUMN = { name: 'DatabaseSchema', type: 'string' };

// The schema-JSON node the app parses (getSchema for IntelliSense AND the
// materialized-view listing fallback). Returns the PARSED node; the served
// mgmt payload stringifies it (the app JSON.parses the string back).
export function databaseSchemaNode(database = DATABASE) {
  return {
    Databases: {
      [database]: {
        Name: database,
        Tables: {
          [TABLE_NAME]: { OrderedColumns: TABLE_COLUMNS.map((c) => c.name) },
        },
        MaterializedViews: {
          [MV_NAME]: { OrderedColumns: MV_COLUMNS.map((c) => c.name) },
        },
      },
    },
  };
}

export function databaseSchemaJson(database = DATABASE) {
  return JSON.stringify(databaseSchemaNode(database));
}

// ---------------------------------------------------------------------------
// Error payloads (shapes understood by describeKustoError)
// ---------------------------------------------------------------------------

export const ERRORS = {
  // Served for `.show databases` when a scenario needs test-connection
  // failure (spec scenario 2, failure case).
  connectionFailed: {
    status: 400,
    code: 'General_BadRequest',
    message: 'PermaAuthException: Caller is not authorized to perform this action',
  },
  // Served for `.show materialized views` to exercise the schema-JSON
  // fallback path (the observed ANOVEDA PROD SYN0002 behavior — see
  // current-state Known Issues).
  mvListingRejected: {
    status: 400,
    code: 'SemanticErrors',
    message: 'SYN0002: malformed query',
  },
};

// ---------------------------------------------------------------------------
// Default dataset — what a plain `startMockKustoServer()` serves
// ---------------------------------------------------------------------------

/**
 * Builds the default mock dataset from the fixtures above.
 * @param {object} [options]
 * @param {boolean} [options.materializedViewsError=false] When true, serves
 *   `.show materialized views` with the SYN0002-style error so a scenario
 *   exercises the app's schema-JSON fallback; MVs still surface (from the
 *   schema node), exactly like the real prod anomaly.
 */
export function defaultDataset({ materializedViewsError = false } = {}) {
  return {
    queries: {
      [TAKE_QUERY]: { columns: TAKE_QUERY_COLUMNS, rows: TAKE_QUERY_ROWS },
      [CONTEXT_MENU_QUERY]: {
        columns: CONTEXT_MENU_QUERY_COLUMNS,
        rows: CONTEXT_MENU_QUERY_ROWS,
      },
      [FAILING_QUERY]: { error: QUERY_ERROR },
    },
    mgmt: {
      '.show databases': {
        columns: SHOW_DATABASES_COLUMNS,
        rows: SHOW_DATABASES_ROWS,
      },
      '.show tables': {
        columns: SHOW_TABLES_COLUMNS,
        rows: SHOW_TABLES_ROWS,
      },
      '.show materialized views': materializedViewsError
        ? { error: ERRORS.mvListingRejected }
        : { columns: SHOW_MV_COLUMNS, rows: SHOW_MV_ROWS },
      '.show database schema as json': {
        columns: [SCHEMA_JSON_COLUMN],
        rows: [{ DatabaseSchema: databaseSchemaJson() }],
      },
    },
  };
}
