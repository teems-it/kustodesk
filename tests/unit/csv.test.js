// tests/unit/csv.test.js
import { describe, it, expect } from 'vitest';
import { toCsv } from '../../src/main/csv';

describe('toCsv', () => {
  const cols = [{ name: 'id' }, { name: 'name' }, { name: 'meta' }];

  it('writes a quoted header row', () => {
    expect(toCsv(cols, [])).toBe('"id","name","meta"');
  });

  it('quotes every value', () => {
    const csv = toCsv(cols, [{ id: 1, name: 'abc', meta: 'x' }]);
    expect(csv).toBe('"id","name","meta"\n"1","abc","x"');
  });

  it('doubles embedded quotes', () => {
    const csv = toCsv(cols, [{ id: 1, name: 'say "hi"', meta: null }]);
    expect(csv).toBe('"id","name","meta"\n"1","say ""hi""",');
  });

  it('keeps commas and newlines inside quoted cells', () => {
    const csv = toCsv(cols, [{ id: 1, name: 'a,b', meta: 'line1\nline2' }]);
    expect(csv).toBe('"id","name","meta"\n"1","a,b","line1\nline2"');
  });

  it('JSON-serializes object values', () => {
    const csv = toCsv(cols, [{ id: 1, name: 'x', meta: { a: 1 } }]);
    expect(csv).toBe('"id","name","meta"\n"1","x","{""a"":1}"');
  });

  it('maps null and undefined to bare (unquoted) empty cells', () => {
    const csv = toCsv(cols, [{ id: null, name: undefined, meta: 'v' }]);
    expect(csv).toBe('"id","name","meta"\n,,"v"');
  });

  it('serializes multiple rows', () => {
    const rows = [{ id: 1, name: 'a', meta: null }, { id: 2, name: 'b', meta: null }];
    expect(toCsv(cols, rows).split('\n')).toHaveLength(3);
  });
});
