# Stacked Form Containers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authors group inputs in a vertically stacked container and preserve that group in submitted form data.

**Architecture:** Extend the existing `EditableField` union with a container whose children are existing input fields. Reuse the schema builder’s recursive object conversion for containers, then add a focused container branch to the builder’s existing selection and child-editing flows.

**Tech Stack:** React 19, TypeScript, Mantine, RJSF, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-22-stacked-form-containers-design.md`

## Global Constraints

- Containers are single-level, vertically stacked groups; do not add a grid or column system.
- Containers cannot contain containers or repeatable lists.
- Keep existing repeatable-list behavior unchanged.
- Reject duplicate generated property keys within each object scope.
- Do not modify unrelated existing working-tree changes.

## Review Focus

- A required child of a container must become required inside the container object, not at the form root.
- Equal labels in separate containers must be valid because they resolve in different object scopes.
- A container’s nested UI schema must use the same widgets as equivalent root inputs.
- The selected container must expose child-add actions; a selected child must expose input settings.
- Deleting a child must retain its container and deleting the container must remove its full group.

### Task 1: Convert container fields to nested schemas

**Files:**
- Modify: `src/domain/templateSchema.ts`
- Test: `tests/template-contract.test.ts`

**Interfaces:**
- Produces: `FieldKind` includes `'container'`; `buildTemplateDocument(name, fields)` converts a container to an object property.
- Consumes: `EditableField.children` for container child inputs.

- [ ] **Step 1: Write the failing contract tests**

```ts
it('serializes a container into a nested object scope', () => {
  const template = buildTemplateDocument('Intake', [{
    id: 'container-1', kind: 'container', label: 'Contact details', children: [
      { id: 'text-1', kind: 'text', label: 'Name', required: true },
      { id: 'email-1', kind: 'email', label: 'Email' }
    ]
  }]);

  expect(template.schema.properties).toMatchObject({
    contact_details: { type: 'object', properties: {
      name: { type: 'string', title: 'Name' }, email: { type: 'string', title: 'Email' }
    }, required: ['name'] }
  });
  expect(template.uiSchema).toMatchObject({ contact_details: {
    name: { 'ui:widget': 'text' }, email: { 'ui:widget': 'email' }
  } });
});

it('allows matching child labels in separate containers', () => {
  expect(() => buildTemplateDocument('Intake', [
    { id: 'container-1', kind: 'container', label: 'Home', children: [{ id: 'text-1', kind: 'text', label: 'Postcode' }] },
    { id: 'container-2', kind: 'container', label: 'Work', children: [{ id: 'text-2', kind: 'text', label: 'Postcode' }] }
  ])).not.toThrow();
});
```

- [ ] **Step 2: Run the contract tests and confirm the new test fails because `container` is missing**

Run: `npm test -- tests/template-contract.test.ts`

Expected: FAIL with a TypeScript/type or schema mismatch identifying unsupported `container` fields.

- [ ] **Step 3: Add the minimal container conversion**

```ts
export type FieldKind = /* existing kinds */ | 'container';

const nestedObject = field.kind === 'list' || field.kind === 'container'
  ? buildObjectSchema(field.children ?? [])
  : undefined;
const schema = field.kind === 'container'
  ? { type: 'object', title: field.label, ...nestedObject!.schema }
  : /* existing list and scalar branches */;
uiSchema[key] = field.kind === 'container'
  ? nestedObject!.uiSchema
  : /* existing list and scalar branches */;
```

- [ ] **Step 4: Run the contract tests and confirm they pass**

Run: `npm test -- tests/template-contract.test.ts`

Expected: PASS.

### Task 2: Add container authoring to the builder

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/builder.test.tsx`

**Interfaces:**
- Consumes: `FieldKind = 'container'` and `EditableField.children` from Task 1.
- Produces: authors can add a container, add permitted child inputs, and see nested canvas blocks.

- [ ] **Step 1: Write the failing builder test**

```tsx
it('adds an input inside a stacked container', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'Add container' }));
  expect(screen.getByText('Container fields')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add email field' }));

  expect(screen.getByText('Untitled Email')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the builder test and confirm it fails because the container palette action is absent**

Run: `npm test -- tests/builder.test.tsx`

Expected: FAIL because no button named `Add container` exists.

- [ ] **Step 3: Add the minimal builder support**

```tsx
const fieldKinds = [/* existing kinds */, { kind: 'container', label: 'Container' }];
const containerChildKinds = fieldKinds.filter(({ kind }) => kind !== 'container' && kind !== 'list' && kind !== 'heading');
const emptyField = (kind, index) => ({
  /* existing values */,
  ...(kind === 'container' ? { children: [] } : {})
});
```

Use the existing list child selection, update, reorder, and delete paths for
containers as well as lists. In the canvas, render children beneath a selected
container with a container-specific class. In settings, label its child section
`Container fields`, use `containerChildKinds`, and label deletion `Delete container`.

- [ ] **Step 4: Run the builder test and confirm it passes**

Run: `npm test -- tests/builder.test.tsx`

Expected: PASS.

### Task 3: Verify the integrated feature

**Files:**
- Modify: `src/App.tsx` only if type checking identifies a container-specific issue.
- Test: `tests/template-contract.test.ts`, `tests/builder.test.tsx`

**Interfaces:**
- Consumes: nested schema conversion from Task 1 and container authoring from Task 2.
- Produces: type-safe production build with current behavior retained.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: PASS with TypeScript and Vite completing successfully.

- [ ] **Step 3: Inspect the scoped diff**

Run: `git diff -- src/App.tsx src/domain/templateSchema.ts src/styles.css tests/builder.test.tsx tests/template-contract.test.ts`

Expected: only container data-model, schema, UI, and test changes are present.
