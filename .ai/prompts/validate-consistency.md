# /validate-context — Feature Complete (Consistency Check)

> **Role:** You are the AI assistant performing a consistency audit. You cross-check the actual codebase against the PCS context files (especially `decisions.md`) to find inconsistencies, drift, or outdated information. You also handle spec lifecycle management.

---

## Instructions

### 1. Read All Context Files

Read all PCS context files to understand the recorded state:
- `.ai/context/current-state.md`
- `.ai/context/tasks.md`
- `.ai/context/decisions.md`
- `.ai/context/progress-log.md`

### 2. Read the Active Spec (If Any)

If there's an active spec in `.ai/specs/feature-*.md`, read it to check if the implementation matches the intended behavior and Definition of Done (DoD).

### 3. Cross-Check Code Against Decisions

For each decision in `decisions.md`:
1. Find the relevant code areas mentioned in the decision.
2. Verify the code still follows the decision.
3. If the code has diverged (the decision was silently overridden or is now outdated), flag it as an **inconsistency**.

### 4. Cross-Check Tasks Against Reality

For each task in `tasks.md`:
- **In Progress** items: Is the work actually visible in the codebase? If not, it may be stale.
- **Todo** items: Are any of these already done? If so, move them to Done.
- **Done** items: Quick spot-check that they're actually complete.

### 5. Check current-state.md Accuracy

- Does the **Status** line match reality?
- Are **Known Issues** still relevant? Remove resolved ones.
- Is the **Next Step** still the logical next action?

### 6. Produce a Consistency Report

Present your findings in this format:

```
## Consistency Report — <YYYY-MM-DD>

### ✅ Consistent
- <list of areas where code and context files agree>

### ⚠️ Inconsistencies
- **<area/decision>:** <description of the inconsistency>
  - **Recorded:** <what the context file says>
  - **Actual:** <what the code shows>
  - **Recommendation:** <how to fix — update the context file, or update the code, or add a new decision>

### 📋 Stale Items
- <any tasks or known issues that are no longer relevant>
```

### 7. Optionally Compress Old Progress Log Entries

If `progress-log.md` has grown large (e.g., 10+ entries), offer to compress older entries:
1. Summarize old entries into a single "compressed" block at the top of the log.
2. Extract any architectural decisions from old entries and ensure they're captured in `decisions.md`.
3. Keep the last 3-5 session entries in full detail.

Ask the developer before compressing — don't do it silently.

### 8. Spec Lifecycle Management

If the active spec's feature is complete:
1. Update the spec file's `# Status:` line to `DONE`.
2. Move the spec file to `.ai/specs/done/` (create the directory if it doesn't exist).
3. Update `current-state.md` to reflect the feature is complete and set a new Next Step.

---

## Rules

1. **Never auto-fix inconsistencies silently.** Always present the report first and let the developer decide what to fix.
2. **Decisions.md is append-only.** If a decision is outdated, add a new superseding dated entry — don't delete the old one.
3. **Be thorough but concise.** Don't read every file — focus on the areas mentioned in decisions and tasks.
4. **Specs are lifecycle-managed.** Active specs should reflect work in progress. Done specs should be marked and moved.
5. **This is a read-mostly operation.** The only writes should be: moving done items, removing stale issues, updating spec status, or compressing the log (with permission).
</task_progress>