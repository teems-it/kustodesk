# Progress Context System (PCS) — AI Persistent Memory Template

> **A lightweight, disciplined context management system that solves the "AI amnesia problem."**
> Every session starts from zero no more. PCS tracks *where the work is right now*, *what's next*, and *why decisions were made* — across sessions, across features, across time.

---

## What Is This?

The `.ai-template/` folder is a **reusable, project-agnostic template** of the Progress Context System (PCS). Copy it into any repository as `.ai/` and your AI assistant gains a persistent, operational memory layer that survives across sessions.

PCS is **not** a replacement for your project documentation (`docs/architecture.md`, `docs/endpoints.md`, etc.). It is an **operational layer on top** — tracking *where am I, what's next, why did I decide this*.

---

## Directory Structure

```
.ai/
├── README.md                              # This file — the master manual
├── context/                               # Live operational state
│   ├── current-state.md                   # Snapshot: active feature, status, known issues, next step
│   ├── tasks.md                            # Kanban-style: In Progress / Todo / Done
│   ├── decisions.md                        # ADR-lite log: append-only, dated architectural decisions
│   ├── progress-log.md                     # Chronological session log with commit SHAs
│   └── .last-sync                          # Git SHA of last /save-progress (auto-managed)
├── specs/                                  # Spec-Driven Development specs (before implementation)
│   ├── .gitkeep
│   └── feature-template.md                 # SDD spec template (copy for each new feature)
└── prompts/                               # Source of truth for the 5 PCS AI prompts
    ├── load-context.md                    # Session start: reads context, produces a briefing
    ├── continue-task.md                    # Mid-work: picks up from Next Step, implements next chunk
    ├── save-progress.md                    # End of session: syncs git history → context files
    ├── spec-to-implementation.md           # Converts a spec into implementation plan + tasks
    └── validate-consistency.md            # Cross-checks code ↔ decisions.md for inconsistencies
```

---

## The Workflow — Lifecycle of 5 Commands

### 1. `/load-context` — Session Start (Read-Only Briefing)
- **When:** Start of every session or new feature.
- **What it does:** Reads `current-state.md`, `tasks.md`, `decisions.md`, and top entries of `progress-log.md`. Skims architecture docs for awareness.
- **Output:** A concise briefing with: Current state, What's done, In progress, Next step, Known issues, and a Recommendation.
- **Rule:** Never modifies files — purely a read-only status report.

### 2. `/continue-task` — Mid-Implementation (Execute Next Step)
- **When:** During active work on a feature.
- **What it does:** Reads `current-state.md § Next Step` + `decisions.md` + relevant spec file. Implements the next logical chunk following existing code patterns.
- **Key behavior:** After each chunk, the developer commits with a **detailed commit message** (subject + body with bullets per file/area). These rich commit messages are the **primary source of truth** for the next step.
- **If a new architectural decision emerges:** Append to `decisions.md` immediately — don't defer.

### 3. `/save-progress` — End of Session (Sync State)
- **When:** End of session or after committing work.
- **What it does:**
  1. Reads `.last-sync` (stores a git SHA) → runs `git log <sha>..HEAD`
  2. Inspects staged + uncommitted work (hybrid scope)
  3. Parses commit subjects + body bullets as the **primary narrative**
  4. Updates `current-state.md` (status per layer, known issues, refreshed next step)
  5. Moves closed items in `tasks.md` from `In Progress` → `Done`
  6. Appends a dated entry to `progress-log.md` with commit SHAs
  7. Writes new `HEAD` SHA to `.last-sync`
- **Critical rule:** If a commit was sparse, the AI **asks for clarification** instead of hallucinating progress.

### 4. `/validate-context` — Feature Complete (Consistency Check)
- **When:** When a feature is fully done or periodically.
- **What it does:** Cross-checks actual code against `decisions.md`. Lists inconsistencies. Optionally compresses old `progress-log.md` entries into `decisions.md`.
- Also: Marks the spec as `# Status: DONE` or moves it to `specs/done/`.

### 5. `/spec-to-implementation` — Bonus (Spec → Plan)
- **When:** Before implementing a non-trivial feature.
- **What it does:** Converts a `.ai/specs/feature-*.md` spec into a concrete implementation plan with tasks, following the SDD template structure: Goal, High-Level Behavior, Components, Decision Tree, DoD, Test Scenarios.

---

## The Five Context Files — Roles & Rules

| File | Role | Key Rule |
|---|---|---|
| `current-state.md` | **Snapshot** — where am I right now | History goes to `progress-log.md`, not here |
| `tasks.md` | **Kanban** — In Progress / Todo / Done | Only ONE task "In Progress" at a time |
| `decisions.md` | **ADR-lite** — architectural decisions log | Append-only. Never rewrite — add a new superseding dated entry |
| `progress-log.md` | **Chronological log** — session history with SHAs | Entries are dated, reference commits |
| `.last-sync` | **Sync pointer** — git SHA of last save | Auto-managed by `/save-progress` |

---

## Design Philosophy

1. **No duplication** — PCS does not copy your project's `docs/*` folder. It links to them. PCS adds an **operational layer** on top of static docs: *where am I, what's next, why did I decide this*.

2. **Commit messages are truth** — The system is designed so that rich, detailed commit messages drive the `/save-progress` narrative. This incentivizes developers to write meaningful commit bodies.

3. **Append-only decisions** — `decisions.md` is never rewritten. New decisions supersede old ones with dates, creating an auditable trail of architectural evolution.

4. **One task at a time** — Enforces focus by allowing only one "In Progress" task.

5. **Spec-Driven Development** — Non-trivial features get a spec in `.ai/specs/` before implementation, following a structured template.

6. **PCS files are committed** — They are the team's shared brain, so they live in version control.

---

## Quick Start

1. **Copy the template:**
   ```bash
   cp -r .ai-template .ai
   ```

2. **Initialize the context files** — Edit `.ai/context/current-state.md`, `.ai/context/tasks.md`, and `.ai/context/decisions.md` to reflect your project's initial state.

3. **Wire up slash commands** — See `SETUP-CLINE.md` (for Cline) or create workflow files for your AI assistant (Windsurf, Cursor, etc.) that point to `.ai/prompts/*.md`.

4. **Start using the lifecycle:** `/load-context` → work → `/save-progress` → repeat.

---

## Integration with AI Assistants

### Cline
See `SETUP-CLINE.md` for a complete step-by-step setup guide.

### Windsurf / Cascade
Create thin wrapper workflows in `.windsurf/workflows/*.md` that point to `.ai/prompts/*.md`:
```markdown
# /load-context
Read and follow the instructions in `.ai/prompts/load-context.md`
```

### Cursor / Other Assistants
Create custom commands or keybindings that load the prompt files from `.ai/prompts/*.md`. The prompts are written to be AI-agnostic — any assistant that can read files and follow instructions can use them.

---

## License

This template is free to use, copy, modify, and distribute. No attribution required.