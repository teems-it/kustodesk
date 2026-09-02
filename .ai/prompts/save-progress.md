# /save-progress — End of Session (Sync State)

> **Role:** You are the AI assistant responsible for syncing the project's operational state files with what actually happened in git since the last sync. You update the PCS context files to reflect reality, using commit messages as your primary narrative source.

---

## Instructions

### 1. Read the Last Sync Pointer

Read `.ai/context/.last-sync` to get the git SHA of the last `/save-progress` run.

- If the file is empty or doesn't exist, use the initial commit (or `git rev-list --max-parents=0 HEAD`) as the baseline.

### 2. Get New Commits Since Last Sync

Run:
```bash
git log <last-sync-sha>..HEAD --pretty=format:"%H%n%an%n%ad%n%n%B%n---COMMIT-END---" --date=short
```

This gives you each commit's SHA, author, date, and **full body** (subject + bullet points).

### 3. Inspect Uncommitted Work (Hybrid Scope)

Also check for staged or uncommitted changes:
```bash
git diff --stat HEAD
git diff --cached --stat
```

If there are uncommitted changes, note them — they represent work-in-progress that hasn't been captured yet.

### 4. Parse the Narrative

From the commit messages and uncommitted changes, extract:
- **What was done** — which files/areas changed and why
- **What's complete** — features, layers, or tasks that are finished
- **What's in progress** — things started but not finished
- **Known issues** — anything mentioned in commit bodies or visible from the diff

### 5. Update current-state.md

Update the following sections of `.ai/context/current-state.md`:

| Section | How to Update |
|---------|---------------|
| **Active Feature** | Change if a feature was completed and a new one started |
| **Status** | Update the one-line status to reflect current reality |
| **Layer Progress** | Update per-layer status (e.g., "Backend: done", "Tests: in progress") |
| **Known Issues** | Add new issues discovered, remove resolved ones |
| **Next Step** | Set the logical next action based on what's done and what remains |

**Critical:** Do not write history into `current-state.md`. History goes to `progress-log.md`.

### 6. Update tasks.md

- Move completed items from **In Progress** → **Done**
- Add new items discovered from the work to **Todo**
- Ensure only **ONE** task is In Progress at a time
- If no task is clearly in progress, pick the most logical next Todo item and set it as In Progress

### 7. Append to progress-log.md

Add a new dated entry:

```markdown
## <YYYY-MM-DD> — Session Summary

**Commits:** `<short-sha-1>`, `<short-sha-2>`, ...

**What was done:**
- <bullet summary from commit messages>

**Status after session:**
- <one-line status reflecting where things stand now>

**Next:**
- <what the next session should pick up>
```

### 8. Update .last-sync

Write the current `HEAD` SHA to `.ai/context/.last-sync`:

```bash
git rev-parse HEAD > .ai/context/.last-sync
```

---

## Rules

1. **Commit messages are the primary narrative source.** Parse them carefully — the bullet points in commit bodies tell you what changed and why.
2. **If a commit is sparse** (e.g., "wip" or "fix stuff" with no body), **ask the developer for clarification** instead of hallucinating progress. Say: "Commit `<sha>` has a sparse message: '<message>'. What did you actually change in this commit?"
3. **Never rewrite history in progress-log.md.** Only append new entries.
4. **Never rewrite decisions.md.** Only append new entries.
5. **current-state.md is a snapshot, not a log.** It should always reflect the *current* state, not accumulate history.
6. **Hybrid scope:** Include both committed work (since last sync) and uncommitted work in your analysis.
7. **If nothing changed since last sync** (no new commits, no uncommitted changes), say so and skip the update. Don't create empty progress-log entries.
</task_progress>