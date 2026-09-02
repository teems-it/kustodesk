# Spec: <Feature Name>

> **Status:** DRAFT  <!-- DRAFT → APPROVED → IN PROGRESS → DONE -->
> **Created:** <YYYY-MM-DD>
> **Owner:** <name or @handle>

---

## Goal

<One or two sentences describing what this feature achieves and why it matters.>

## High-Level Behavior

<2–5 sentences describing what the feature does from the user or system perspective. Focus on the "what", not the "how".>

## Background / Motivation

<Why is this feature needed? What problem does it solve? Reference any relevant prior decisions from `decisions.md`.>

---

## Components

### <Component 1 Name>
- **Purpose:** <what this component does>
- **Type:** <new file | modification to existing file | config change>
- **File(s):** `<path/to/file>`
- **Pattern to follow:** <reference existing code, e.g. "follow the pattern of `src/existing/Service.java`">
- **Key behavior:**
  - <bullet point 1>
  - <bullet point 2>

### <Component 2 Name>
...

---

## Decision Tree

For each non-trivial decision point, document the options considered, the choice, and the rationale.

### <Decision 1: e.g. "How should X be handled?">
- **Option A:** <description>
  - Pros: ...
  - Cons: ...
- **Option B:** <description>
  - Pros: ...
  - Cons: ...
- **Chosen:** <Option A/B>
- **Reason:** <why>
- **Trade-off:** <what we give up by choosing this>

---

## Definition of Done (DoD)

- [ ] <criterion 1 — functional>
- [ ] <criterion 2 — functional>
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing (if applicable)
- [ ] No regressions in existing tests
- [ ] Code follows existing project conventions
- [ ] Relevant `decisions.md` entries added (if architectural decisions were made)
- [ ] Docs updated (if the feature changes public API or behavior)

---

## Test Scenarios

1. **<scenario name>**
   - **Given:** <precondition>
   - **When:** <action>
   - **Then:** <expected result>

2. **<scenario name>**
   - **Given:** <precondition>
   - **When:** <action>
   - **Then:** <expected result>

---

## Out of Scope

- <explicitly list anything that is NOT part of this feature but might be confused for it>
- <future enhancements that are deferred>

---

## Notes

<Any additional context, links to relevant issues/PRs, references to architecture docs, etc.>
</task_progress>
</write_to_file>