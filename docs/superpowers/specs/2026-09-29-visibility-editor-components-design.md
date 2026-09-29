# Visibility Editor Components Design

## Goal

Make conditional logic easier to scan by showing connector and negation controls only when
they describe an existing expression, while separating the visibility editor from the
general form-builder screen.

## Scope

- Remove the copy “All conditions in this group must match.”
- Keep the concise group description for a single nested condition and the existing mixed
  AND/OR explanation.
- Replace the trailing constructor controls with only **Add condition** and **Add group**.
- Move the connector and IS / IS NOT controls into the expression sequence once a block has
  been added. A non-first block shows `AND/OR` then `IS/IS NOT` immediately before it. A
  first block that is a group shows only `IS/IS NOT` before the group.
- Preserve a standalone condition's X button as the final, top-aligned control in its input
  row.
- Apply the same sequencing rules to nested list-row conditions.

## Component Boundaries

`App.tsx` remains responsible for form-builder state, page/canvas composition, and invoking
visibility settings. Visibility-specific rendering moves to `src/components/visibility/`:

- `VisibilityEditor.tsx` owns temporary connector/negation choices and renders the root and
  nested expression trees.
- `ConditionValue.tsx` renders the value input dictated by a selected field type, including
  the disabled “Checked” value for checkboxes.
- `VisibilitySettings.tsx` owns the modal's draft/apply/cancel interaction and consumes the
  editor.

The extracted components receive their field data and change callbacks through explicit props;
they do not read or mutate the builder's page state directly. Shared domain types stay in
`src/domain/templateSchema.ts` rather than creating a generic utility layer.

## Interaction Rules

The editor starts with one condition. Each existing condition retains its own IS / IS NOT
selector. A group receives IS / IS NOT from its parent sequence, after the connector when it
is not the first expression. Add buttons do not display pending connector or negation choices.
They append a condition or group using the default AND and IS values. The newly appended block
then displays its own connector and, for groups, its group negation selector.

Removing an expression keeps the existing connector-removal behaviour: removing a middle item
retains the connector that preceded it for the expression that follows. Removing the first
condition when a group remains makes that group the first expression and leaves its IS / IS NOT
selector visible without an AND/OR selector.

## Testing

Builder tests cover:

- constructors initially showing only the two add buttons;
- connector and group-negation controls appearing only with an appended group;
- a first group showing IS / IS NOT without a connector;
- standalone X controls remaining in the condition input row; and
- the equivalent list-row group behaviour.

Existing form rendering and visibility evaluation are unchanged. The full Vitest suite and the
production build remain the verification gate.
