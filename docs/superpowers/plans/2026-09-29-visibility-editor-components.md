# Visibility Editor Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify conditional-logic constructors and extract visibility editing from `App.tsx` into focused React components.

**Architecture:** `VisibilityEditor` owns expression-tree editing while receiving fields and an `onChange` callback from its parent. `ConditionValue` is a field-kind-specific value control. `VisibilitySettings` owns modal draft/apply/cancel flow and composes the editor; `App.tsx` retains builder state and passes props at the existing settings location.

**Tech Stack:** React 19, TypeScript, Mantine 9, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-visibility-editor-components-design.md`

## Global Constraints

- Do not change visibility-rule evaluation or persisted domain types in `src/domain/templateSchema.ts`.
- Do not touch unrelated semi-custom or template fixture edits.
- Use responsive flex layouts; do not reintroduce fixed widths for conditional controls.
- Preserve accessible labels for fields, connectors, negation selectors, and remove icon buttons.

## Review Focus

- A default single condition still renders its own `Field is` selector and has an inline, top-aligned X button.
- A constructor with no appended expression exposes only Add condition and Add group, not pending AND/OR or IS/IS NOT controls.
- Adding a condition uses default AND/IS semantics without showing an extra group-negation selector.
- A first group exposes IS/IS NOT with no connector after removing the preceding condition.
- List-row expressions follow the same visibility and removal rules as field expressions.

---

### Task 1: Lock down conditional constructor behaviour

**Files:**
- Modify: `tests/builder.test.tsx`

**Interfaces:**
- Consumes: the existing visibility modal exposed by `App`.
- Produces: regression coverage for the extracted editor's public UI behaviour.

- [ ] **Step 1: Write failing tests for constructor visibility and group placement**

Add a test asserting the initial constructor has Add condition/Add group but no `Join with` or `New rule is` inputs. Add flows that append a group, assert its preceding connector and group IS selector appear, then remove the first condition and assert the group remains with `Group is` but no connector.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run tests/builder.test.tsx`

Expected: FAIL because the existing constructor still renders pending connector and negation selectors.

- [ ] **Step 3: Add failing coverage for list-row group placement and inline removal**

Add assertions that list-row constructors share the no-pending-controls behaviour and that standalone removal remains an accessible X button in the condition row.

- [ ] **Step 4: Run the focused test to verify the additional assertions fail**

Run: `npx vitest run tests/builder.test.tsx`

Expected: FAIL on the unimplemented list-row constructor and placement expectations.

### Task 2: Extract field-value and expression-tree components

**Files:**
- Create: `src/components/visibility/ConditionValue.tsx`
- Create: `src/components/visibility/VisibilityEditor.tsx`
- Modify: `src/App.tsx`
- Test: `tests/builder.test.tsx`

**Interfaces:**
- Consumes: `EditableField`, `VisibilityExpressionGroup`, `VisibilityRule`, and related expression types from `src/domain/templateSchema.ts`.
- Produces: `ConditionValue` with controller, condition, and change props; `VisibilityEditor` with `fields`, `field`, and `onChange(rule)` props.

- [ ] **Step 1: Implement and export `ConditionValue`**

Move the existing value-control decision from `App.tsx` into `ConditionValue.tsx`. Preserve the disabled, read-only `Checked` input for checkboxes; retain select, number, date/time, and text value behaviours.

- [ ] **Step 2: Move visibility helper functions and `VisibilityEditor` into `VisibilityEditor.tsx`**

Move controller/list selection, cycle prevention, expression normalization, summaries, expression rendering, and remove controls into the editor module. Keep them module-private unless another extracted component needs them.

- [ ] **Step 3: Remove the moved implementation and unused imports from `App.tsx`**

Replace the local editor usage with the imported `VisibilityEditor`; leave builder-level field state and update callbacks in `App.tsx`.

- [ ] **Step 4: Run the focused test to verify the extracted editor preserves existing behaviour**

Run: `npx vitest run tests/builder.test.tsx`

Expected: the new Task 1 assertions still fail for constructor behaviour only; existing builder
coverage continues to pass.

### Task 3: Extract modal settings and implement constructor visibility

**Files:**
- Create: `src/components/visibility/VisibilitySettings.tsx`
- Modify: `src/components/visibility/VisibilityEditor.tsx`
- Modify: `src/App.tsx`
- Test: `tests/builder.test.tsx`

**Interfaces:**
- Consumes: `VisibilityEditor` from Task 2 and `EditableField` / `VisibilityRule` domain types.
- Produces: `VisibilitySettings` with `fields`, `field`, and `onChange(rule)` props, replacing the local settings component in `App.tsx`.

- [ ] **Step 1: Implement `VisibilitySettings`**

Move the modal draft state, Set/Edit display rules trigger, Cancel, and Apply conditional logic controls into `VisibilitySettings.tsx`. Keep its public props identical to the former local component's data contract.

- [ ] **Step 2: Simplify `renderRuleConstructor` in `VisibilityEditor`**

Render only Add condition and Add group. Append expressions with default `and` and `is` settings. Render connector and group IS/IS NOT controls solely in the expression sequence before appended groups; do not show the removed “All conditions in this group must match.” copy.

- [ ] **Step 3: Use the extracted settings component from `App.tsx`**

Import `VisibilitySettings`, delete the local definition, and retain the existing field-settings call site and update callback.

- [ ] **Step 4: Run the focused test suite**

Run: `npx vitest run tests/builder.test.tsx`

Expected: PASS with the Task 1 behaviour assertions.

### Task 4: Verify the refactor end-to-end

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/visibility/ConditionValue.tsx`
- Modify: `src/components/visibility/VisibilityEditor.tsx`
- Modify: `src/components/visibility/VisibilitySettings.tsx`
- Modify: `tests/builder.test.tsx`

**Interfaces:**
- Consumes: all extracted visibility components and existing builder integration.
- Produces: a cleanly separated, tested conditional-logic feature.

- [ ] **Step 1: Remove dead imports and duplicated helpers**

Use TypeScript compilation to identify and remove only imports or helpers made redundant by the extraction.

- [ ] **Step 2: Run the full suite**

Run: `npm test`

Expected: PASS for every test file.

- [ ] **Step 3: Run production verification**

Run: `npm run build && git diff --check`

Expected: production build succeeds and no whitespace errors are reported.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/visibility/ConditionValue.tsx src/components/visibility/VisibilityEditor.tsx src/components/visibility/VisibilitySettings.tsx tests/builder.test.tsx
git commit -m "simplify visibility editor controls"
```
