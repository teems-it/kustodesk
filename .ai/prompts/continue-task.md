# /continue-task — Mid-Implementation (Execute Next Step)

> **Role:** You are the AI assistant actively implementing the next chunk of work on this project. You pick up from where the last session left off, guided by the PCS context files and any active spec.

---

## Instructions

### 1. Load the Current Context

Read the following files to understand where things stand:

| File | Purpose |
|------|---------|
| `.ai/context/current-state.md` | Focus especially on the **§ Next Step** section — this is your primary directive |
| `.ai/context/tasks.md` | Confirm what's In Progress and what's queued |
| `.ai/context/decisions.md` | Understand architectural constraints and past decisions that affect your implementation |
| `.ai/specs/feature-*.md` | If there's an active spec for the current feature, read it fully — it defines the intended behavior and DoD |

### 2. Implement the Next Logical Chunk

Based on the Next Step from `current-state.md`:

1. **Explore the codebase** to understand existing patterns, conventions, and structure. Follow the patterns already established in the project — do not introduce new architectural styles unless a decision in `decisions.md` supports it.
2. **Implement the next chunk** of work. A "chunk" should be a coherent, committable unit — not a single line, but not an entire layer either. Think: one feature slice, one endpoint + tests, one component + styling, etc.
3. **Write or update tests** alongside the implementation, following the project's existing test patterns.
4. **Run the relevant tests or build** to verify your work compiles/passes.

### 3. Commit with a Detailed Message

After completing the chunk, stage and commit with a **rich commit message**:

```
<type>: <concise subject line>

- <file/area>: <what changed and why>
- <file/area>: <what changed and why>
- <file/area>: <what changed and why>
```

**The commit message body is critical** — it is the primary narrative source for the next `/save-progress`. Each bullet should describe what changed in that file/area and why. Be specific.

### 4. If a New Architectural Decision Emerges

If during implementation you make a non-trivial architectural decision (chose library X over Y, introduced a new pattern, refactored a layer), **immediately append a new entry to `.ai/context/decisions.md`**:

```markdown
## <YYYY-MM-DD> — <Decision Title>

**Status:** Accepted
**Context:** <why this decision was needed>
**Decision:** <what was decided>
**Consequences:** <impact, trade-offs, what it enables/blocks>
```

Do not defer this — capture it while the reasoning is fresh.

### 5. Update current-state.md Next Step

After committing, update the **§ Next Step** section of `current-state.md` to reflect what the next chunk should be. This ensures the next session (or `/save-progress`) knows exactly where to continue.

---

## Rules

1. **Follow existing patterns.** Match the code style, architecture, and conventions already in the project. Check `decisions.md` for constraints.
2. **One chunk at a time.** Don't try to implement the entire feature in one go. Implement, verify, commit, then update Next Step.
3. **Commit messages are truth.** Write detailed, bullet-point commit bodies. These drive the `/save-progress` narrative.
4. **If blocked, say so.** If you can't complete the chunk due to missing info, an error you can't resolve, or an ambiguity, stop and ask the developer for clarification. Update `current-state.md` § Known Issues with the blocker.
5. **Never rewrite decisions.md.** Only append new entries.
6. **Always run tests/build after changes.** Don't leave broken code behind.