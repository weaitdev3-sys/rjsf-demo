# Layout Blocks and Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add layout palettes, optional container labels, static text, two-column layouts, and autocomplete fields to the form builder.

**Architecture:** Extend `EditableField` with layout and field variants. The schema converter recursively emits semantic container objects, skips static layouts, and flattens two-column children into their enclosing scope. The editor tracks a selected child’s parent and, for two columns, its column side.

**Tech Stack:** React 19, TypeScript, Mantine, RJSF, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-22-layout-blocks-and-autocomplete-design.md`

## Global Constraints

- Fields and layouts appear in separate palette panels.
- Containers hide their label only in presentation; their nested response object remains.
- Text and headings create no response property.
- Two columns flatten into the enclosing schema scope and cannot contain layout blocks or lists.
- Autocomplete remains option-based and uses the searchable Mantine select widget.

## Review Focus

- Hidden container labels must not remove the nested object schema.
- Duplicate labels across two columns must fail in the enclosing scope.
- Static text must not become a `properties` entry.
- Adding a child to the right column must not place it in the left column.
- Autocomplete must retain its option enum and use the searchable select widget.

### Task 1: Extend layout and field schema conversion

**Files:**
- Modify: `src/domain/templateSchema.ts`
- Test: `tests/template-contract.test.ts`

**Interfaces:**
- Produces: `FieldKind` values `autocomplete`, `text`, and `twoColumn`; `EditableField.showLabel`, `content`, `leftChildren`, and `rightChildren`.
- Produces: `buildTemplateDocument(name, fields)` skips static layouts and flattens two-column children.

- [ ] **Step 1: Write failing schema tests**

```ts
it('serializes autocomplete options and hides a container title without losing its object', () => {
  const template = buildTemplateDocument('Intake', [
    { id: 'container-1', kind: 'container', label: 'Contact', showLabel: false, children: [
      { id: 'autocomplete-1', kind: 'autocomplete', label: 'Suburb', options: ['Newtown', 'Surry Hills'] }
    ] }
  ]);

  expect(template.schema.properties).toMatchObject({ contact: { type: 'object', properties: { suburb: { enum: ['Newtown', 'Surry Hills'] } } } });
  expect(template.uiSchema).toMatchObject({ contact: { 'ui:options': { label: false }, suburb: { 'ui:widget': 'select' } } });
});

it('omits static text and flattens two-column children', () => {
  const template = buildTemplateDocument('Intake', [
    { id: 'text-1', kind: 'text', label: 'Notice', content: 'Keep this handy.' },
    { id: 'columns-1', kind: 'twoColumn', label: 'Details', leftChildren: [{ id: 'left-1', kind: 'text', label: 'First name' }], rightChildren: [{ id: 'right-1', kind: 'text', label: 'Last name' }] }
  ]);
  expect(template.schema.properties).toMatchObject({ first_name: { type: 'string' }, last_name: { type: 'string' } });
  expect(template.schema.properties).not.toHaveProperty('notice');
});
```

- [ ] **Step 2: Run the contract tests and confirm they fail for unsupported kinds**

Run: `npm test -- tests/template-contract.test.ts`

Expected: FAIL because the new kinds and schema behavior do not exist.

- [ ] **Step 3: Implement minimal schema conversion**

```ts
type EditableField = { showLabel?: boolean; content?: string; leftChildren?: EditableField[]; rightChildren?: EditableField[]; /* existing fields */ };

if (field.kind === 'heading' || field.kind === 'text') continue;
if (field.kind === 'twoColumn') {
  appendFields([...field.leftChildren ?? [], ...field.rightChildren ?? []], properties, uiSchema, required);
  continue;
}
```

Use a small shared `appendFields` helper so root, container, and flattened-column scopes apply identical duplicate-key and required-field rules. Emit `{ 'ui:options': { label: false }, ...childrenUiSchema }` for a container with `showLabel === false`.

- [ ] **Step 4: Run contract tests and confirm they pass**

Run: `npm test -- tests/template-contract.test.ts`

Expected: PASS.

### Task 2: Add palette separation and new block authoring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/builder.test.tsx`

**Interfaces:**
- Consumes: the new field model from Task 1.
- Produces: two palette panels, editable static text, container label visibility, autocomplete options, and left/right column authoring.

- [ ] **Step 1: Write failing builder tests**

```tsx
it('separates layout blocks from fields and toggles a container label', async () => {
  render(<App />);
  expect(screen.getByText('Fields')).toBeInTheDocument();
  expect(screen.getByText('Layout')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Add container' }));
  expect(screen.getByLabelText('Show label')).toBeChecked();
  fireEvent.click(screen.getByLabelText('Show label'));
  expect(screen.getByLabelText('Show label')).not.toBeChecked();
});

it('adds fields to both two-column layout columns', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add two-column' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add text field to left column' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add email to right column' }));
  expect(screen.getByText('Untitled Text field')).toBeInTheDocument();
  expect(screen.getByText('Untitled Email')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run builder tests and confirm they fail because panels and column actions are absent**

Run: `npm test -- tests/builder.test.tsx`

Expected: FAIL with missing palette labels or buttons.

- [ ] **Step 3: Implement the editor behavior**

```tsx
const inputKinds = /* data-entry kinds, including autocomplete */;
const layoutKinds = /* container, heading, text, twoColumn */;
const addColumnChild = (side: 'leftChildren' | 'rightChildren', kind: FieldKind) => { /* append to the selected layout side */ };
```

Render `Fields` and `Layout` panels. Add a Mantine `Checkbox` for container
`showLabel`, a content `Textarea` for text blocks, options editing for
autocomplete, and independently labeled Left/Right column child controls.
Use a column-aware selected child state so updates, moves, and deletes apply
to the selected side only. Style two columns with a responsive two-column
grid and stack each column vertically.

- [ ] **Step 4: Run builder tests and confirm they pass**

Run: `npm test -- tests/builder.test.tsx`

Expected: PASS.

### Task 3: Verify the integrated layout model

**Files:**
- Modify: `src/App.tsx` only if the build exposes a type mismatch.
- Test: `tests/template-contract.test.ts`, `tests/builder.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: a type-safe, tested builder implementation.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: PASS with zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: PASS after TypeScript and Vite complete.

- [ ] **Step 3: Inspect the scoped changes**

Run: `git diff --check && git diff -- src/App.tsx src/domain/templateSchema.ts src/styles.css tests/builder.test.tsx tests/template-contract.test.ts`

Expected: only requested layout/autocomplete behavior and tests are changed.
