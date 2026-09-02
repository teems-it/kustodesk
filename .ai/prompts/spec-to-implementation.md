# /spec-to-implementation — Convert Spec to Implementation Plan

> **Role:** You are the AI assistant that converts a feature spec (`.ai/specs/feature-*.md`) into a concrete, actionable implementation plan. You produce a structured breakdown that the developer can follow step-by-step.

---

## Instructions

### 1. Read the Spec

Read the spec file referenced or provided. If the user says "convert the spec for X", look for `.ai/specs/feature-X.md` or `.ai/specs/*X*.md`.

### 2. Read Current Context

Read `.ai/context/current-state.md` and `.ai/context/decisions.md` to understand:
- What's already built
- What architectural patterns are established
- What constraints exist

### 3. Read Relevant Architecture Docs

Skim the project's architecture documentation (if any exists) to understand:
- Codebase structure and conventions
- Existing patterns to follow
- Integration points

### 4. Produce the Implementation Plan

Output a plan in this structure:

```markdown
## Implementation Plan: <Feature Name>

### Goal
<one-line summary from the spec>

### High-Level Behavior
<2-3 sentences describing what the feature does from the user/system perspective>

### Components to Create/Modify

#### 1. <Component Name> — <Create | Modify>
- **File(s):** `<path/to/file>`
- **What:** <what this component does>
- **Pattern:** <which existing code pattern to follow>
- **Depends on:** <other components or nothing>

#### 2. <Component Name> — <Create | Modify>
...

### Decision Tree
For each decision point in the spec:
- **<Decision Question>**
  - **Chosen:** <option>
  - **Reason:** <why>
  - **Trade-off:** <what we give up>

### Definition of Done (DoD)
- [ ] <criterion from spec>
- [ ] <criterion from spec>
- [ ] Tests pass
- [ ] No regressions

### Test Scenarios
1. **<scenario name>**
   - **Given:** <precondition>
   - **When:** <action>
   - **Then:** <expected result>
2. ...

### Suggested Task Breakdown

Order the tasks so each one is independently committable:

1. [ ] <task 1> — <component(s) involved>
2. [ ] <task 2> — <component(s) involved>
3. [ ] <task 3> — <component(s) involved>
...

### Implementation Notes
- <any patterns, conventions, or gotchas to be aware of>
- <links to relevant existing code that should be used as reference>
```

### 5. Update tasks.md (Optional)

If the developer approves the plan, add the suggested task breakdown to `.ai/context/tasks.md` under the **Todo** section.

### 6. Update current-state.md (Optional)

If the developer approves the plan, update `.ai/context/current-state.md`:
- Set the **Active Feature** to this feature
- Set the **Next Step** to the first task in the breakdown

---

## Rules

1. **Follow existing patterns.** Always reference existing code as the pattern to follow. Don't invent new architectures when the codebase already has a convention.
2. **Each task must be independently committable.** A developer should be able to complete one task, commit with a meaningful message, and have the codebase in a working state.
3. **Decisions go to decisions.md.** If a new architectural decision emerges during planning, append it to `decisions.md` immediately.
4. **Be specific about files.** Don't say "create a service" — say "create `src/main/java/com/example/FeatureService.java` following the pattern of `src/main/java/com/example/ExistingService.java`".
5. **The plan is a proposal.** Present it to the developer for approval before modifying any context files.
</task_progress>