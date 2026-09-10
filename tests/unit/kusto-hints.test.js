// tests/unit/kusto-hints.test.js
// Pure hint-engine tests (spec 0004 DoD) - no DOM or CodeMirror needed;
// the module is loaded through its UMD module.exports shim.
import { describe, it, expect } from 'vitest';
import {
  KEYWORDS, FUNCTIONS, TYPES, MAX_COMPLETIONS,
  prefixMatch, collectIdentifiers, buildCompletions,
} from '../../src/renderer/kusto-hints';

const SCHEMA = {
  tables: {
    StormEvents: ['EventId', 'EventType', 'State', 'StartTime', 'Tag'],
    TempReadings: ['Timestamp', 'TempC', 'SensorId'],
  },
  materializedViews: { MicroWeatherView: ['Timestamp', 'State', 'AvgTemp'] },
};

describe('prefixMatch', () => {
  it('filters case-insensitively', () => {
    expect(prefixMatch(['StormEvents', 'temp'], 'ST')).toEqual(['StormEvents']);
  });

  it('accepts an empty prefix (everything) and caps at MAX_COMPLETIONS', () => {
    const big = Array.from({ length: 80 }, (_, i) => 'C' + i);
    expect(prefixMatch(big, "")).toHaveLength(MAX_COMPLETIONS);
    expect(MAX_COMPLETIONS).toBe(50);
  });

  it('works on { text } items as well as plain strings', () => {
    expect(prefixMatch([{ text: 'where' }, { text: 'extend' }], 'wh')).toEqual([{ text: 'where' }]);
  });
});

describe('collectIdentifiers', () => {
  it('collects a bare table at the start of a pipeline segment', () => {
    expect(collectIdentifiers('StormEvents | where State == "TX"')).toEqual(['StormEvents']);
  });

  it('collects bracket-quoted names (including hyphenated)', () => {
    expect(collectIdentifiers('["my-table"] | count')).toEqual(['my-table']);
  });

  it('skips operators and collects join targets', () => {
    const ids = collectIdentifiers('T1 | where x == 1 | join kind=inner T2 on y');
    expect(ids).toContain('T1');
    expect(ids).toContain('T2');
    expect(ids).not.toContain('where');
    expect(ids).not.toContain('join');
  });

  it('deduplicates across statements', () => {
    expect(collectIdentifiers('StormEvents | take 5; StormEvents | count')).toEqual(['StormEvents']);
  });

  it('is best-effort on empty or garbage input', () => {
    expect(collectIdentifiers('')).toEqual([]);
    expect(collectIdentifiers(null)).toEqual([]);
  });
});

describe('buildCompletions', () => {
  const emptyCtx = { code: '' };

  it('ranks tables/materialized views before keywords/functions', () => {
    const out = buildCompletions('t', emptyCtx, SCHEMA);
    const types = out.map((c) => c.hintType);
    expect(types[0]).toBe('table'); // TempReadings matches the prefix
    const firstVocab = types.findIndex((t) => t === 'keyword' || t === 'function' || t === 'type');
    const lastResource = Math.max(types.lastIndexOf('table'), types.lastIndexOf('view'));
    expect(lastResource).toBeLessThan(firstVocab);
  });

  it('suggests matching resources by prefix', () => {
    expect(buildCompletions('micro', emptyCtx, SCHEMA)).toEqual([
      { text: 'MicroWeatherView', displayText: 'MicroWeatherView', hintType: 'view' },
    ]);
  });

  it('scopes dot-completion to the resolvable table columns only', () => {
    const out = buildCompletions('ev', { code: 'StormEvents', dotTable: 'StormEvents' }, SCHEMA);
    expect(out.map((c) => c.text)).toEqual(["EventId", "EventType"]);
    expect(out.every((c) => c.hintType === 'column')).toBe(true);
  });

  it('resolves the dotTable case-insensitively (Kusto identifiers are case-insensitive)', () => {
    const out = buildCompletions('ev', { code: 'stormevents', dotTable: 'stormevents' }, SCHEMA);
    expect(out.map((c) => c.text)).toEqual(['EventId', 'EventType']);
    expect(out.every((c) => c.hintType === 'column')).toBe(true);
  });

  it('falls back to the general path when the dotTable is unresolvable', () => {
    const out = buildCompletions('s', { code: 'StormEvents', dotTable: 'Nope' }, SCHEMA);
    expect(out.some((c) => c.hintType === 'table')).toBe(true);
    expect(out.some((c) => c.hintType === 'column')).toBe(true);
  });

  it('suggests only columns of query-referenced resources when references resolve', () => {
    // StormEvents is referenced: AvgTemp (MV-only) and Timestamp (TempReadings)
    // must NOT be suggested - picking them would fail with SEM0100
    const out = buildCompletions('t', { code: 'StormEvents | project ' }, SCHEMA);
    const texts = out.map((c) => c.text);
    expect(texts).toContain('Tag'); // StormEvents column
    expect(texts).not.toContain('Timestamp'); // TempReadings column
    expect(texts).not.toContain('AvgTemp'); // MV-only column
  });

  it('resolves referenced resources case-insensitively for column scoping', () => {
    const out = buildCompletions('tag', { code: 'stormevents | project ' }, SCHEMA);
    expect(out.map((c) => c.text)).toEqual(['Tag']);
  });

  it('falls back to all-DB columns when the query references nothing (fresh query)', () => {
    const out = buildCompletions('t', emptyCtx, SCHEMA);
    const cols = out.filter((c) => c.hintType === 'column').map((c) => c.text);
    expect(cols).toContain('Tag'); // StormEvents column
    expect(cols).toContain('Timestamp'); // TempReadings column
  });

  it('keeps working with no schema at all (keywords/functions only)', () => {
    const out = buildCompletions('sum', null, null);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => c.hintType === 'keyword' || c.hintType === 'function')).toBe(true);
    expect(out.map((c) => c.text)).toContain('summarize');
    expect(out.map((c) => c.text)).toContain('sum()');
  });

  it('deduplicates shared column names', () => {
    const schema = { tables: { A: ['State'], B: ['State'] }, materializedViews: {} };
    const out = buildCompletions('stat', emptyCtx, schema);
    expect(out).toEqual([{ text: 'State', displayText: 'State', hintType: 'column' }]);
  });

  it('caps the popup at MAX_COMPLETIONS', () => {
    const big = { tables: {}, materializedViews: {} };
    for (let i = 0; i < 80; i++) big.tables['T' + i] = ['c' + i];
    const out = buildCompletions('', emptyCtx, big);
    expect(out).toHaveLength(MAX_COMPLETIONS);
  });

  it('accepts a custom vocabulary override', () => {
    const out = buildCompletions('f', emptyCtx, {}, { keywords: ['foo'], functions: [], types: [] });
    expect(out).toEqual([{ text: 'foo', displayText: 'foo', hintType: 'keyword' }]);
  });
});

describe('vocabulary', () => {
  it('has non-empty keyword, function, and type lists', () => {
    expect(KEYWORDS.length).toBeGreaterThan(20);
    expect(FUNCTIONS.length).toBeGreaterThan(40);
    expect(TYPES.length).toBeGreaterThan(5);
  });

  it('every function entry is call-shaped', () => {
    for (const f of FUNCTIONS) expect(f.endsWith('()')).toBe(true);
  });

  it('contains the spec-called-out entries', () => {
    for (const k of ['where', 'extend', 'summarize', 'project', 'take', 'render']) expect(KEYWORDS).toContain(k);
    for (const f of ['count()', 'sum()', 'strcat()', 'todouble()', 'datetime()']) expect(FUNCTIONS).toContain(f);
    expect(TYPES).toContain('datetime');
  });
});
