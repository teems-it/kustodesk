// src/main/csv.js
// Pure CSV serialization for query results.
// Extracted from the `export:csv` IPC handler so it can be unit-tested.

function toCsv(columns, rows) {
  const header = columns.map((c) => `"${c.name}"`).join(',');
  const rowLines = rows.map((row) =>
    columns.map((c) => {
      const val = row[c.name];
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [header, ...rowLines].join('\n');
}

module.exports = { toCsv };
