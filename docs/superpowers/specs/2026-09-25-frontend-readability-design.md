# Frontend readability refactor

## Purpose

Make the form-builder frontend straightforward to navigate and maintain without changing its visible behaviour, persisted template format, or API contract.

## Current problem

`src/App.tsx` combines unrelated responsibilities: field metadata and pure helper functions, visibility-rule editing, template persistence, builder mutation handlers, page management, the builder workspace, and fill-mode rendering. Much of its JSX and control flow is compressed into single lines, making ordinary changes difficult to review safely.

## Design

Keep `App` as the application composition and state owner. It will load and save templates, hold builder/fill state, own mutation callbacks, and select build versus fill mode.

Move UI responsibilities into focused components:

- `components/builder/FormLayoutControls` configures flat versus stepper layouts and page removal.
- `components/builder/PageControls` selects, names, and adds pages.
- `components/builder/FieldPalette` presents input and layout block choices.
- `components/builder/FormCanvas` renders blocks and reports a selected field or child.
- `components/builder/FieldSettings` edits a selected block, including child-field actions.
- `components/form/StepperNavigation` renders stepper progress and navigation.
- `components/form/FillForm` renders preview/fill mode and submits values.
- `components/visibility/VisibilitySettings` and supporting visibility components own the visibility-rule editor.

Move field catalogues and pure form-builder helpers into a domain-owned module, alongside the existing schema functions. That module will expose explicit names and types rather than relying on implementation details of `App`.

## Boundaries and data flow

Components receive data plus narrowly scoped callbacks. They do not fetch, persist, or manipulate parent state directly. `App` passes selected values and callbacks down, preserving a single source of truth for template and response state.

The existing `TemplateDocument` contract, JSON templates, API requests, and test-facing labels remain unchanged. Refactoring may add helper tests, but existing behavior tests remain the primary guard against regressions.

## Error handling

Existing save/load/submission errors remain owned and displayed by `App`. Extracted components render supplied errors or invoke callbacks; they do not introduce competing notification state.

## Verification

Run the focused frontend tests during extraction, then the full test suite, TypeScript/Vite production build, and `git diff --check`. Confirm the default page, page addition/removal, stepper, tabs, conditional visibility, and form submission flows remain covered by the existing suite.

## Scope constraints

- No visual redesign.
- No API, storage, or schema migration.
- No new dependency or generic component framework.
- Prefer clear local interfaces and conventional multiline TypeScript/JSX over broad abstractions.
