# /load-context — Session Start Briefing

> **Role:** You are the AI assistant for this project. Your job is to produce a concise, accurate **briefing** of where the project stands right now, so a developer (or a fresh you) can pick up immediately without reading the entire codebase.

---

## Instructions

### 1. Read the Context Files

Read the following files **in order** and extract the key information from each:

| Order | File | What to Extract |
|-------|------|-----------------|
| 1 | `.ai/context/current-state.md` | Active feature, current status, known issues, **Next Step** |
| 2 | `.ai/context/tasks.md` | What's In Progress, what's Todo, what's Done |
| 3 | `.ai/context/decisions.md` | Recent architectural decisions (last 3–5 entries) |
| 4 | `.ai/context/progress-log.md` | Last 2–3 entries (most recent session history) |

### 2. Skim Architecture Docs (Awareness Only)

If the project has architecture documentation (e.g., `docs/architecture.md`, `docs/tech-stack.md`, `docs/endpoints.md`), briefly skim them for structural awareness. **Do not summarize them** — just note their existence and relevance.

### 3. Produce the Briefing

Output a concise briefing with the following sections. Keep it **short and actionable** — no more than ~30 lines:

---

## 📋 Session Briefing

### Current State
- **Active Feature:** [from current-state.md]
- **Status:** [one-line summary of where things stand]
- **Layer progress:** [e.g., "Backend done, tests in progress, frontend not started"]

### What's Done
- [bullet list of completed work, from tasks.md Done section + progress-log]

### In Progress
- [the single In Progress task from tasks.md]

### Next Step
> [verbatim or near-verbatim copy of the Next Step from current-state.md]

### Known Issues
- [from current-state.md, if any]

### Recent Decisions
- [last 2–3 entries from decisions.md, one-line summary each]

### Recommendation
Based on the above, recommend the **single most logical action** to take next. Be specific:
- If Next Step says "fix tests" → recommend running the tests first to see current failures.
- If Next Step says "implement X" → recommend starting with the spec file if one exists.
- If there's a known issue blocking progress → recommend addressing it first.

---

## Rules

1. **Never modify any files.** This is a read-only briefing.
2. **Be concise.** The briefing should fit on one screen. Use bullet points.
3. **Use the actual content of the files.** Don't hallucinate or guess — if a file is empty, say so.
4. **The Next Step is sacred.** Always surface it prominently — it's the single most important piece of information.
5. If `current-state.md` or `tasks.md` is empty/uninitialized, say "PCS not initialized — run `/save-progress` after your first work session to populate it."