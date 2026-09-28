# Template Response Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver stable, editable, HTML-renderable saved responses for full-custom templates and semi-custom care plans.

**Architecture:** Persist a shared discriminated response envelope containing an immutable template snapshot and type-specific entered data. A shared API and `/responses` library own discovery and lifecycle actions, while full-custom and semi-care-plan editors/renderers consume the appropriate branch of the union.

**Tech Stack:** TypeScript, React, Mantine, Express, Handlebars, Vitest, Testing Library, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-28-template-response-lifecycle-design.md`

## Global Constraints

- Preserve an immutable template snapshot for every response; source-template changes must not change historical records.
- Use a stable response ID and update saved responses in place.
- Keep legacy submissions readable and unchanged.
- Do not add dependencies.
- Do not mutate user-owned `semi-subforms/` or `semi-care-plans/` fixture data.
- Escape every user-entered value in generated HTML.

## Review Focus

- A response must still load and render after its source template is changed or unavailable; cover in Task 2 and Task 3.
- A PATCH containing a changed kind, template ID, or template snapshot must be rejected rather than corrupting record identity; cover in Task 3.
- A malformed semi-care-plan item-list/narrative payload must receive a clear 4xx response; cover in Task 3.
- HTML-like text entered into either response kind must be escaped rather than executed; cover in Task 4.
- Filters with no matches and an empty response library must remain usable and not show stale rows; cover in Task 5.

---

### Task 1: Define response-domain contracts and normalizers

**Files:**
- Create: `src/domain/response.ts`
- Modify: `src/domain/semiCustom.ts`
- Test: `tests/template-contract.test.ts`

**Interfaces:**
- Consumes: `TemplateDocument` from `src/domain/templateSchema.ts`; `SemiCarePlanTemplate` from `src/domain/semiCustom.ts`.
- Produces: `ResponseKind`, `SavedResponse`, `FullCustomResponse`, `SemiCarePlanResponse`, `SemiCarePlanResponseData`, `createEmptySemiCarePlanResponseData(template)`, and `isSemiCarePlanResponseData(value)`.

- [ ] **Step 1: Write failing contract tests for response union and care-plan defaults**

```ts
expect(createEmptySemiCarePlanResponseData(template)).toEqual({
  participant: { 'Full Legal Name': '' },
  generalInfo: { health: { 'Health Summary': '' } },
  services: { 'DOM-01': { itemList: [{ Description: '' }], sections: { remarks: '' } } },
});
expect(isSemiCarePlanResponseData({ services: { 'DOM-01': { itemList: [{ Description: 1 }] } } })).toBe(false);
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `npm test -- tests/template-contract.test.ts`

Expected: FAIL because response contracts and normalizers do not exist.

- [ ] **Step 3: Implement `src/domain/response.ts` and extend `src/domain/semiCustom.ts`**

Define the discriminated union and care-plan value shape. Derive default fields only from enabled/snapshotted configuration; do not depend on live subforms.

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `npm test -- tests/template-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain contract**

```bash
git add src/domain/response.ts src/domain/semiCustom.ts tests/template-contract.test.ts
git commit -m "feat: define saved response contracts"
```

### Task 2: Persist stable response snapshots

**Files:**
- Modify: `server/templateStore.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Consumes: `SavedResponse` union from Task 1.
- Produces: `TemplateStore.createResponse(response)`, `getResponse(id)`, `listResponses(filters?)`, and `updateResponse(id, formData)`.

- [ ] **Step 1: Write failing store/API tests for creation, filtering, and an in-place update**

```ts
expect(created.body).toMatchObject({ kind: 'full-custom', templateId: 'contact-form' });
expect(updated.body.id).toBe(created.body.id);
expect(updated.body.createdAt).toBe(created.body.createdAt);
expect(updated.body.updatedAt).not.toBe(created.body.updatedAt);
expect(list.body).toEqual([expect.objectContaining({ id: created.body.id })]);
```

- [ ] **Step 2: Run the focused API test to verify it fails**

Run: `npm test -- tests/api.test.ts`

Expected: FAIL because `responses/` persistence methods do not exist.

- [ ] **Step 3: Implement response persistence in `TemplateStore`**

Add a `responsesDirectory`. Generate a `randomUUID()` response ID on creation, write JSON atomically under that ID, return metadata newest-updated-first, and replace only `formData` plus `updatedAt` on update. Keep `templateSnapshot`, `kind`, `templateId`, and `createdAt` from the stored response.

- [ ] **Step 4: Add snapshot-preservation coverage**

Create a template and response, save a changed version of the template, then assert the stored response still exposes the original snapshot. Also assert responses can be read without consulting the source template.

- [ ] **Step 5: Run the focused API test to verify it passes**

Run: `npm test -- tests/api.test.ts`

Expected: PASS for persistence tests while existing submission tests remain green.

- [ ] **Step 6: Commit response persistence**

```bash
git add server/templateStore.ts tests/api.test.ts
git commit -m "feat: persist stable response snapshots"
```

### Task 3: Expose validated response lifecycle endpoints

**Files:**
- Modify: `server/app.ts`
- Modify: `tests/api.test.ts`

**Interfaces:**
- Consumes: Task 1 response type guards and Task 2 store methods.
- Produces: `GET /api/responses`, `POST /api/responses`, `GET /api/responses/:id`, and `PATCH /api/responses/:id`.

- [ ] **Step 1: Write failing endpoint tests**

```ts
expect((await request(app).get(`/api/responses/${created.body.id}`)).status).toBe(200);
expect((await request(app).get('/api/responses?kind=semi-care-plan&templateId=home-support-plan')).body).toHaveLength(1);
expect((await request(app).patch(`/api/responses/${created.body.id}`).send({ templateId: 'other', formData: {} })).status).toBe(400);
expect((await request(app).post('/api/responses').send({ kind: 'semi-care-plan', templateId: 'home-support-plan', formData: { services: { 'PC-01': { itemList: [{ Task: 9 }] } } } })).status).toBe(400);
```

- [ ] **Step 2: Run the focused endpoint tests to verify they fail**

Run: `npm test -- tests/api.test.ts`

Expected: FAIL with missing response routes.

- [ ] **Step 3: Implement response routes and server-owned snapshot creation**

On POST, resolve and snapshot the live template based on `kind`, normalize/validate the matching data, and derive `templateName`. On PATCH accept only `{ formData }`; validate against the stored snapshot. Map not found and invalid input to existing JSON error conventions.

- [ ] **Step 4: Run the focused endpoint tests to verify they pass**

Run: `npm test -- tests/api.test.ts`

Expected: PASS, including bad ID, bad kind, missing template, malformed payload, and identity-invariant cases.

- [ ] **Step 5: Commit the response API**

```bash
git add server/app.ts tests/api.test.ts
git commit -m "feat: add response lifecycle API"
```

### Task 4: Render saved response snapshots as HTML

**Files:**
- Modify: `server/printRenderer.ts`
- Modify: `server/semiPrintRenderer.ts`
- Modify: `server/app.ts`
- Modify: `tests/printRenderer.test.ts`
- Modify: `tests/api.test.ts`

**Interfaces:**
- Consumes: `FullCustomResponse` and `SemiCarePlanResponse` from Task 1; `getResponse(id)` from Task 2.
- Produces: `renderResponseHtml(response: SavedResponse): string` and `GET /api/responses/:id/html`.

- [ ] **Step 1: Write failing renderer tests for populated values and escaping**

```ts
expect(renderResponseHtml(fullResponse)).toContain('Ari');
expect(renderResponseHtml(semiResponse)).toContain('Morning support');
expect(renderResponseHtml(semiResponse)).toContain('&lt;script&gt;');
expect(renderResponseHtml(semiResponse)).not.toContain('<script>');
```

- [ ] **Step 2: Run renderer tests to verify they fail**

Run: `npm test -- tests/printRenderer.test.ts`

Expected: FAIL because renderers only support live template previews.

- [ ] **Step 3: Implement snapshot response rendering**

Reuse `renderPrintableHtml` for full-custom snapshots. Extend the semi document mapper so participant/general/SERV values, schedules, item-list rows, and narrative text render in their configured sections. Let Handlebars perform default escaping; do not use triple-stash values.

- [ ] **Step 4: Add and verify the response HTML endpoint test**

Run: `npm test -- tests/printRenderer.test.ts tests/api.test.ts`

Expected: PASS with `text/html` response and 404 for unknown IDs.

- [ ] **Step 5: Commit response rendering**

```bash
git add server/printRenderer.ts server/semiPrintRenderer.ts server/app.ts tests/printRenderer.test.ts tests/api.test.ts
git commit -m "feat: render saved responses as HTML"
```

### Task 5: Add the shared response library and route wiring

**Files:**
- Create: `src/Responses.tsx`
- Modify: `src/Root.tsx`
- Modify: `src/App.tsx`
- Modify: `src/SemiCustom.tsx`
- Modify: `src/styles.css`
- Modify: `tests/root.test.tsx`
- Create: `tests/responses.test.tsx`

**Interfaces:**
- Consumes: `GET /api/responses?kind=&templateId=` from Task 3 and response metadata from Task 1.
- Produces: `ResponseLibrary` component at `/responses`, with query-string filter support and navigation targets for type-specific editors.

- [ ] **Step 1: Write failing response-library tests**

```tsx
render(<ResponseLibrary />);
expect(await screen.findByText('Care plan response')).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: 'Care plans' }));
expect(screen.queryByText('Full custom response')).not.toBeInTheDocument();
expect(screen.getByRole('link', { name: 'Edit response' })).toHaveAttribute('href', '/semi/care-plan/response/care-1');
```

- [ ] **Step 2: Run response-library tests to verify they fail**

Run: `npm test -- tests/responses.test.tsx tests/root.test.tsx`

Expected: FAIL because the shared route/component do not exist.

- [ ] **Step 3: Implement `ResponseLibrary` and route/navigation integration**

Fetch once, derive kind and template filter options from results, display an empty state for no matches, and construct safe internal links for full-custom and semi response editors. Add library entry links from both authoring workspaces without removing existing template actions.

- [ ] **Step 4: Run response-library tests to verify they pass**

Run: `npm test -- tests/responses.test.tsx tests/root.test.tsx`

Expected: PASS, including no-match/empty-state coverage.

- [ ] **Step 5: Commit the response library**

```bash
git add src/Responses.tsx src/Root.tsx src/App.tsx src/SemiCustom.tsx src/styles.css tests/root.test.tsx tests/responses.test.tsx
git commit -m "feat: add shared response library"
```

### Task 6: Make full-custom responses editable in place

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/builder.test.tsx`

**Interfaces:**
- Consumes: full-custom response endpoints from Task 3 and response editor URL from Task 5.
- Produces: full-custom fill mode that POSTs a new response or PATCHes the loaded response, plus HTML-view action for saved responses.

- [ ] **Step 1: Write failing full-custom response flow tests**

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Save response' }));
expect(fetch).toHaveBeenCalledWith('/api/responses', expect.objectContaining({ method: 'POST' }));
// after loading /full-custom/response/response-1
expect(fetch).toHaveBeenCalledWith('/api/responses/response-1', expect.objectContaining({ method: 'PATCH' }));
```

- [ ] **Step 2: Run the full-custom test to verify it fails**

Run: `npm test -- tests/builder.test.tsx`

Expected: FAIL because fill mode posts legacy submissions instead of saved responses.

- [ ] **Step 3: Implement response-aware full-custom editor state**

Recognize template fill and response edit routes, load the response snapshot/data when applicable, preserve existing build/template behavior, and use POST/PATCH according to whether a response ID is loaded. Link the saved HTML URL rather than rendering unsaved form state as a record.

- [ ] **Step 4: Run the full-custom test to verify it passes**

Run: `npm test -- tests/builder.test.tsx`

Expected: PASS while existing builder behavior remains intact.

- [ ] **Step 5: Commit full-custom response editing**

```bash
git add src/App.tsx tests/builder.test.tsx
git commit -m "feat: edit full-custom saved responses"
```

### Task 7: Add care-plan template library and generated response editor

**Files:**
- Modify: `src/SemiCustom.tsx`
- Modify: `src/Root.tsx`
- Modify: `src/styles.css`
- Modify: `tests/semiCustom.test.tsx`

**Interfaces:**
- Consumes: semi care-plan template APIs, `SemiCarePlanResponseData` from Task 1, response APIs from Task 3, response URL conventions from Task 5.
- Produces: care-plan template library (New/View/Edit/Fill) and generated create/edit response form.

- [ ] **Step 1: Write failing semi-care-plan library and fill tests**

```tsx
expect(await screen.findByRole('button', { name: 'Fill Home support plan' })).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: 'Fill Home support plan' }));
expect(await screen.findByLabelText('Full Legal Name')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Add item-list row for DOM-01' })).toBeInTheDocument();
```

- [ ] **Step 2: Run the semi-custom tests to verify they fail**

Run: `npm test -- tests/semiCustom.test.tsx`

Expected: FAIL because care plans only have authoring workflow screens.

- [ ] **Step 3: Implement care-plan template-library routes and actions**

List saved plans with New, View HTML, Edit, and Fill actions. Reuse the multi-step authoring workflow for create/edit; load the persisted plan for edit rather than active subforms changing its assignments.

- [ ] **Step 4: Implement `SemiCarePlanResponseEditor`**

Render inputs from the response snapshot: participant/general fields, configured shared SERV fields, schedule controls, narrative text areas, and item-list tables with editable add/remove rows. Create a response on first save and PATCH only form data when reopened.

- [ ] **Step 5: Add response-edit and item-list row tests**

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Add item-list row for DOM-01' }));
expect(screen.getAllByLabelText('DOM-01 Description')).toHaveLength(2);
fireEvent.click(screen.getByRole('button', { name: 'Save response' }));
expect(fetch).toHaveBeenLastCalledWith('/api/responses/care-1', expect.objectContaining({ method: 'PATCH' }));
```

- [ ] **Step 6: Run the semi-custom tests to verify they pass**

Run: `npm test -- tests/semiCustom.test.tsx`

Expected: PASS, including current template authoring workflow tests.

- [ ] **Step 7: Commit care-plan response workflow**

```bash
git add src/SemiCustom.tsx src/Root.tsx src/styles.css tests/semiCustom.test.tsx
git commit -m "feat: fill and edit care-plan responses"
```

### Task 8: Run full regression and final review

**Files:**
- Modify: only files required by failures found during verification.
- Test: all `tests/**/*.test.*`.

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces: verified response lifecycle across both template systems.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: production build succeeds. Record any non-fatal bundle-size warning in handoff.

- [ ] **Step 3: Inspect the final diff for accidental data-file changes**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; no changes to user-owned `semi-subforms/` or `semi-care-plans/`.

- [ ] **Step 4: Commit verification-only corrections if required**

```bash
git add <only files changed by verification fixes>
git commit -m "fix: verify template response lifecycle"
```
