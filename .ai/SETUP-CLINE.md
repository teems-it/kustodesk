# Setting Up PCS (Progress Context System) in Cline

This guide walks you through installing the **Progress Context System (PCS)** in a new project using **Cline** (VS Code AI extension).

---

## Prerequisites

- [VS Code](https://code.visualstudio.com/) installed
- [Cline extension](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) installed and configured
- A git repository initialized (`git init`) — PCS relies on git commit history

---

## Step 1 — Copy the `.ai-template` Folder

Copy the entire `.ai-template` folder into your project root and rename it to `.ai`:

```bash
# From your project root
cp -r /path/to/.ai-template .ai
```

Or if you're copying from this repo:

```bash
cp -r .ai-template .ai
```

After copying, your project should have:

```
your-project/
├── .ai/
│   ├── README.md
│   ├── SETUP-CLINE.md
│   ├── context/
│   │   ├── current-state.md
│   │   ├── tasks.md
│   │   ├── decisions.md
│   │   ├── progress-log.md
│   │   └── .last-sync
│   ├── prompts/
│   │   ├── load-context.md
│   │   ├── continue-task.md
│   │   ├── save-progress.md
│   │   ├── validate-consistency.md
│   │   └── spec-to-implementation.md
│   └── specs/
│       ├── .gitkeep
│       └── feature-template.md
├── ... (your project files)
```

---

## Step 2 — Initialize the Context Files

Open the following files and replace the placeholder content with your project's initial state:

### `context/current-state.md`
Fill in:
- **Project name** and one-line description
- **Active feature** (or "None — project just started")
- **Status** per layer (backend, frontend, infra, etc.)
- **Known issues** (or "None")
- **Next step** (the very first thing to do)

### `context/tasks.md`
Add your first tasks. Keep only ONE task under "In Progress". Put the rest under "Todo".

### `context/decisions.md`
If you have existing architectural decisions, add them as dated entries. If not, leave the placeholder — it will grow organically.

### `context/progress-log.md`
Leave the placeholder entry. It will be updated on your first `/save-progress`.

### `context/.last-sync`
Set this to the current HEAD SHA of your repo:

```bash
git rev-parse HEAD > .ai/context/.last-sync
```

---

## Step 3 — Create Cline Custom Instructions

Cline doesn't have "slash commands" like Windsurf, but you can achieve the same workflow using **custom instructions** or **project-level rules**.

### Option A: Project-level `.clinerules` file (recommended)

Create a `.clinerules` file in your project root:

```bash
touch .clinerules
```

Add the following content:

```markdown
# PCS (Progress Context System) Integration

This project uses a Progress Context System stored in `.ai/`. The AI assistant should be aware of and use these context files.

## Context Files Location
- Current state: `.ai/context/current-state.md`
- Tasks: `.ai/context/tasks.md`
- Decisions: `.ai/context/decisions.md`
- Progress log: `.ai/context/progress-log.md`
- Specs: `.ai/specs/`
- Prompts: `.ai/prompts/`

## Workflow Commands

When the user says one of the following phrases, read and execute the corresponding prompt file:

### "load context" or "load-context"
Read and execute the instructions in `.ai/prompts/load-context.md`

### "continue task" or "continue-task"
Read and execute the instructions in `.ai/prompts/continue-task.md`

### "save progress" or "save-progress"
Read and execute the instructions in `.ai/prompts/save-progress.md`

### "validate context" or "validate-context"
Read and execute the instructions in `.ai/prompts/validate-consistency.md`

### "spec to implementation" or "spec-to-implementation"
Read and execute the instructions in `.ai/prompts/spec-to-implementation.md`

## Rules
- Always check `.ai/context/current-state.md` before starting work on a feature
- Append-only to `.ai/context/decisions.md` — never rewrite existing entries
- Only ONE task "In Progress" at a time in `.ai/context/tasks.md`
- Write detailed commit messages (subject + body with bullets) — they are the primary source of truth for `/save-progress`
- History goes to `progress-log.md`, not `current-state.md`
- PCS files are committed to version control
```

### Option B: Cline Custom Instructions (global)

1. Open Cline settings in VS Code (gear icon or `Cmd+,`)
2. Find "Custom Instructions"
3. Paste the same content from Option A above

> **Note:** Option A (`.clinerules`) is project-scoped and travels with the repo. Option B is global and applies to all projects. Use Option A for portability.

---

## Step 4 — Verify the Setup

1. Open VS Code in your project
2. Open Cline chat
3. Type: `load context`
4. Cline should read `.ai/prompts/load-context.md`, follow its instructions, read the context files, and produce a briefing

If Cline doesn't automatically read the prompt file, you can be more explicit:

```
Read the file .ai/prompts/load-context.md and follow its instructions
```

---

## Step 5 — Daily Workflow in Cline

Here's how your typical session looks:

### Starting a Session
```
load context
```
→ Cline reads all context files and gives you a briefing of where things stand.

### During Work
```
continue task
```
→ Cline reads `current-state.md § Next Step`, the relevant spec, and implements the next chunk.

After each chunk, **commit with a detailed message**:
```bash
git add -A
git commit -m "feat: <what was done>

- <file 1>: <what changed>
- <file 2>: <what changed>
- <decision>: <if an architectural decision was made>"
```

### Ending a Session
```
save progress
```
→ Cline syncs git history into the context files, updates `current-state.md`, moves done tasks, appends to `progress-log.md`, and updates `.last-sync`.

### Feature Complete
```
validate context
```
→ Cline cross-checks code against `decisions.md` and reports inconsistencies.

---

## Step 6 — Commit the PCS Files

PCS files are meant to be shared. Commit them:

```bash
git add .ai/ .clinerules
git commit -m "chore: add Progress Context System (PCS) for AI-assisted development

- .ai/context/: live operational state files (current-state, tasks, decisions, progress-log)
- .ai/prompts/: 5 PCS prompt files (load-context, continue-task, save-progress, validate-consistency, spec-to-implementation)
- .ai/specs/: spec-driven development templates
- .clinerules: Cline integration rules for PCS workflow"
```

---

## Troubleshooting

### Cline doesn't read prompt files automatically
Be explicit in your message:
```
Read .ai/prompts/load-context.md and follow all instructions in it.
```

### `.last-sync` is empty or stale
Reset it manually:
```bash
git rev-parse HEAD > .ai/context/.last-sync
```

### Context files are out of sync with actual code
Run `validate context` to get a consistency report, then manually fix any drift.

### Want to use this with Windsurf/Cascade too?
The `.ai/` folder is tool-agnostic. The prompts in `.ai/prompts/` work with any AI assistant that can read files. For Windsurf, create thin wrapper workflows in `.windsurf/workflows/` that point to the prompt files. See `.ai/README.md` for details.

---

## Quick Reference

| Command | Prompt File | When |
|---|---|---|
| `load context` | `.ai/prompts/load-context.md` | Session start |
| `continue task` | `.ai/prompts/continue-task.md` | Mid-work |
| `save progress` | `.ai/prompts/save-progress.md` | End of session |
| `validate context` | `.ai/prompts/validate-consistency.md` | Feature complete |
| `spec to implementation` | `.ai/prompts/spec-to-implementation.md` | New feature planning |
</task_progress>
</write_to_file>