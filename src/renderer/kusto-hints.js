// src/renderer/kusto-hints.js
// Pure Kusto completion-assembly logic for the IntelliSense engine (spec 0004).
// Dependency-free: no DOM or CodeMirror references, so the engine is fully
// unit-testable. Attached to `window` for the no-bundler renderer and also
// CommonJS-exported (UMD shim) so Vitest can require it.

// ---- Curated static vocabulary (v1: minimal-but-useful) ----
const KEYWORDS = [
  'where', 'extend', 'summarize', 'project', 'project-away', 'project-keep',
  'project-rename', 'project-reorder', 'rename', 'take', 'limit', 'top',
  'sort by', 'order by', 'asc', 'desc', 'nulls first', 'nulls last',
  'count', 'distinct', 'sample', 'range', 'render', 'union', 'join',
  'join kind=inner', 'join kind=innerunique', 'join kind=leftouter',
  'join kind=rightouter', 'join kind=fullouter', 'join kind=leftanti',
  'join kind=rightanti', 'join kind=leftsemi', 'join kind=rightsemi',
  'join kind=cross', 'on', 'by', 'into', 'lookup', 'evaluate', 'invoke',
  'mv-expand', 'mv-apply', 'parse', 'parse-kv', 'make-series', 'serialize',
  'facet', 'fork', 'partition', 'reduce by', 'search', 'as', 'with',
  'hint.strategy=shuffle', 'hint.shufflekey',
];
const FUNCTIONS = [
  'count()', 'countif()', 'sum()', 'sumif()', 'avg()', 'avgif()', 'min()',
  'minif()', 'max()', 'maxif()', 'dcount()', 'dcountif()', 'percentile()',
  'stddev()', 'variance()', 'any()', 'take_any()', 'arg_max()', 'arg_min()',
  'make_list()', 'make_set()', 'make_list_if()', 'make_set_if()',
  'strcat()', 'strcat_array()', 'strlen()', 'strcmp()', 'toupper()',
  'tolower()', 'trim()', 'trim_start()', 'trim_end()', 'substring()',
  'split()', 'replace_string()', 'replace_regex()', 'indexof()',
  'isempty()', 'isnotempty()', 'isnull()', 'isnotnull()', 'coalesce()',
  'iff()', 'iif()', 'case()', 'extract()', 'extract_json()', 'parse_json()',
  'toscalar()', 'todynamic()', 'tostring()', 'toint()', 'tolong()',
  'todouble()', 'toreal()', 'tobool()', 'todatetime()', 'totimespan()',
  'datetime()', 'now()', 'ago()', 'datetime_add()', 'datetime_diff()',
  'datetime_part()', 'startofday()', 'endofday()', 'startofweek()',
  'endofweek()', 'dayofweek()', 'dayofmonth()', 'monthofyear()',
  'format_datetime()', 'bin()', 'floor()', 'round()', 'abs()', 'exp()',
  'log()', 'sqrt()', 'pow()', 'rand()', 'array_length()', 'bag_keys()',
  'pack()', 'pack_array()', 'row_number()', 'rank()', 'dense_rank()',
  'prev()', 'next()', 'zip()',
];

const TYPES = [
  'bool', 'datetime', 'dynamic', 'guid', 'int', 'long', 'real', 'string',
  'timespan', 'decimal',
];

// Popup cap: completions beyond this are dropped for popup performance.
const MAX_COMPLETIONS = 50;

const HINT_TYPES = {
  TABLE: "table", VIEW: "view", COLUMN: "column",
  KEYWORD: "keyword", FUNCTION: "function", TYPE: "type",
};

// Operators and function names used to exclude non-table identifiers
// from the best-effort query scan.
const KEYWORD_SET = new Set(
  [...KEYWORDS, ...FUNCTIONS, ...TYPES].map((s) => s.split(" ")[0].split("(")[0].toLowerCase())
);

// ---- prefixMatch: case-insensitive prefix filter with a popup cap ----
// Accepts plain strings or { text } items; returns the matched originals.
function prefixMatch(list, word) {
  const w = String(word || "").toLowerCase();
  return list
    .filter((item) => String(typeof item === "string" ? item : item.text).toLowerCase().startsWith(w))
    .slice(0, MAX_COMPLETIONS);
}

// ---- collectIdentifiers: best-effort table references in query text ----
// No full KQL parser (spec 0004, Decision 3): bracket-quoted names, bare
// identifiers at pipeline-segment starts (line start / after | or ;) that
// are not operators or function calls, and join targets.
function collectIdentifiers(code) {
  const text = String(code || "");
  const found = [];
  const push = (name) => {
    name = String(name || "").trim();
    if (name && !found.includes(name)) found.push(name);
  };
  let m;
  const quoted = /\[\s*"([^"\[\]]+)"\s*\]/g;
  while ((m = quoted.exec(text)) !== null) push(m[1]);
  const segment = /(^|[;\n|])[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*(?![\w(])/g;
  while ((m = segment.exec(text)) !== null) {
    if (!KEYWORD_SET.has(m[2].toLowerCase())) push(m[2]);
  }
  const joinTarget = /\bjoin\b(?:\s+kind\s*=\s*\w+)?\s+([A-Za-z_][A-Za-z0-9_]*)\s+on\b/gi;
  while ((m = joinTarget.exec(text)) !== null) push(m[1]);
  return found;
}

// ---- buildCompletions: ranked completion list for the typed prefix ----
// prefix   - the word being typed ("" shows the first MAX_COMPLETIONS items)
// context  - { code, dotTable }: query text so far and the identifier
//            immediately before a trailing dot (if any)
// schema   - { tables: {name: [cols]}, materializedViews: {name: [cols]} }
// keywords - optional vocabulary override { keywords, functions, types };
//            defaults to the curated lists above
// Ranking (spec 0004, Decision 3): dot-scoped table columns only; otherwise
// tables + MVs, then columns of query-referenced resources only when any are
// resolvable (Kusto identifiers are case-insensitive, so lookups match
// case-insensitively - suggesting another resource's column would build a
// query that fails with SEM0100), all-DB columns only when the query
// references nothing, then keywords/functions/types - deduped and capped.
function buildCompletions(prefix, context, schema, keywords) {
  const vocab = keywords || { keywords: KEYWORDS, functions: FUNCTIONS, types: TYPES };
  const tables = (schema && schema.tables) || {};
  const views = (schema && schema.materializedViews) || {};
  context = context || {};
  const col = (name) => ({ text: name, displayText: name, hintType: HINT_TYPES.COLUMN });

  // Kusto identifiers are case-insensitive - resolve a resource name
  // against tables and materialized views regardless of case.
  const findResource = (name) => {
    const key = String(name || "").toLowerCase();
    if (!key) return null;
    for (const [t, cols] of Object.entries(tables)) if (t.toLowerCase() === key) return cols;
    for (const [v, cols] of Object.entries(views)) if (v.toLowerCase() === key) return cols;
    return null;
  };

  // Dot-completion scoped to a resolvable table/MV
  if (context.dotTable) {
    const cols = findResource(context.dotTable);
    if (cols) return prefixMatch(cols.map(col), prefix);
    // unresolvable - fall through to the general path
  }

  const out = [];
  const seen = new Set();
  const addAll = (items) => {
    for (const item of items) {
      const key = String(item.text).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= MAX_COMPLETIONS) return;
    }
  };

  // 1) tables + materialized views
  addAll(prefixMatch(Object.keys(tables), prefix).map((n) => ({ text: n, displayText: n, hintType: HINT_TYPES.TABLE })));
  addAll(prefixMatch(Object.keys(views), prefix).map((n) => ({ text: n, displayText: n, hintType: HINT_TYPES.VIEW })));

  // 2) columns: of query-referenced resources when there are any (columns
  //    from other resources would yield SEM0100 when picked), otherwise all
  //    DB columns (fresh-query fallback)
  if (out.length < MAX_COMPLETIONS) {
    const referenced = [];
    const seenCols = new Set();
    for (const name of collectIdentifiers(context.code)) {
      const cols = findResource(name);
      if (!cols) continue;
      for (const c of cols) if (!seenCols.has(c)) { seenCols.add(c); referenced.push(c); }
    }
    if (referenced.length) {
      addAll(prefixMatch(referenced, prefix).map(col));
    } else {
      const fallback = [];
      for (const cols of [...Object.values(tables), ...Object.values(views)]) {
        for (const c of cols) if (!seenCols.has(c)) { seenCols.add(c); fallback.push(c); }
      }
      addAll(prefixMatch(fallback, prefix).map(col));
    }
  }

  // 3) curated vocabulary
  if (out.length < MAX_COMPLETIONS) {
    addAll(prefixMatch(vocab.keywords, prefix).map((k) => ({ text: k, displayText: k, hintType: HINT_TYPES.KEYWORD })));
    addAll(prefixMatch(vocab.functions, prefix).map((f) => ({ text: f, displayText: f, hintType: HINT_TYPES.FUNCTION })));
    addAll(prefixMatch(vocab.types, prefix).map((t) => ({ text: t, displayText: t, hintType: HINT_TYPES.TYPE })));
  }

  return out.slice(0, MAX_COMPLETIONS);
}

const KustoHints = {
  HINT_TYPES, KEYWORDS, FUNCTIONS, TYPES, MAX_COMPLETIONS,
  prefixMatch, collectIdentifiers, buildCompletions,
};

// UMD shim: window for the no-bundler renderer, module.exports for Vitest
if (typeof window !== "undefined") window.KustoHints = KustoHints;
if (typeof module !== "undefined" && module.exports) module.exports = KustoHints;
