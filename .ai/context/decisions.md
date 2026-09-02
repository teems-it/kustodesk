# Decisions

> **ADR-lite log — architectural and technical decisions.**
> Append-only. Never rewrite or delete an entry. To supersede a decision, add a new dated entry that references the old one.

---

## How to Use This File

Each entry follows this format:

```
## YYYY-MM-DD — Decision Title

**Context:** Why this decision was needed — what problem or constraint prompted it.

**Decision:** What was decided — the choice made.

**Consequences:** What follows from this decision — impact, trade-offs, things to watch.

**Supersedes:** (optional) Link to a prior decision this replaces.
```

---

<!-- Add new decisions below, newest first. -->

## 2026-05-18 — Azure CLI auth via direct shell-out, not `@azure/identity`

**Context:** The app must authenticate to ADX exactly the way the user's terminal does. The original plan (`implementation_plan.md`) assumed `@azure/identity` `AzureCliCredential` via `KustoConnectionStringBuilder.withAzLoginIdentity()`, but it misbehaves inside Electron — wrong resource scope, PATH resolution issues, and tenant resolution problems (documented in `kusto-client.js` comments).

**Decision:** Shell out to `az account get-access-token --resource https://kusto.kusto.windows.net` directly, wrapped in `KustoConnectionStringBuilder.withTokenProvider()` (per-request callback handles token refresh). Optional `--tenant` scoping for guest users in multiple tenants.

**Consequences:** Auth behaves identically to the terminal — the core promise of the app. Requires `az` on PATH; Electron launched from Finder/Dock doesn't inherit the shell PATH, so common Homebrew locations are prepended to `PATH` at startup in `main.js`. Spawns a child process per token acquisition.

**Supersedes:** The `AzureCliCredential` assumption in `implementation_plan.md` (v1 spec `0001`, Decision 1).

## 2026-05-18 — Plain JSON file storage instead of `electron-store`

**Context:** Need durable persistence for cluster configurations and query history. `implementation_plan.md` proposed `electron-store`.

**Decision:** Plain JSON files (`clusters.json`, `history.json`) read/written with `fs` inside Electron's `userData` path, via a ~100-line `Store` class (`src/main/store.js`).

**Consequences:** Zero storage dependencies, human-inspectable files, history capped at 200 entries, cluster delete cascades to history. No schema validation. Client secrets are stored in plain text in `clusters.json` — known debt; encryption via Electron `safeStorage` is a future candidate.

## 2026-05-18 — CodeMirror 5 via CDN for the query editor

**Context:** The query editor needed syntax highlighting, line numbers, and comment toggling. Candidates: Monaco Editor, CodeMirror 5, CodeMirror 6.

**Decision:** CodeMirror 5 loaded from cdnjs via `<script>` tags in `index.html` — SQL mode, matchbrackets, comment, and placeholder addons; no bundler or build step.

**Consequences:** Lightweight and simple to integrate in a no-bundler Electron app. CDN dependency means network access is needed on first run; no Kusto-specific IntelliSense (SQL highlighting is close enough for v1).

## 2026-05-18 — Cache Kusto clients per cluster/auth, except device-code

**Context:** Query sessions hit the same cluster repeatedly; recreating the client per request adds re-authentication overhead.

**Decision:** Cache `Client` instances keyed by `url::authMethod(:tenantId:clientId)` in `KustoClientManager`. Device-code clients are never cached (the interactive flow must not be reused across attempts). `invalidate()` is called when a cluster is deleted (or its credentials change).

**Consequences:** Faster repeated queries. A small staleness window exists for revoked credentials, bounded by cluster edit/delete which invalidates the cache.