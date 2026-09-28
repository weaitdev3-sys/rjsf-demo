# Template response lifecycle design

## Purpose

Template authors need a consistent way to create, find, complete, revise, and
render records from both authoring systems:

- full-custom form templates;
- semi-custom care-plan templates.

The feature makes completed records first-class saved responses. A response
keeps the exact template structure that was used to create it, can be edited
in place under a stable response ID, and can be viewed as rendered HTML.

## Scope and success criteria

This work adds a shared response library, response persistence and rendering,
and template-library workflows for semi-custom care plans. It preserves the
existing full-custom template editor and fill mode, while making saved
responses discoverable and editable.

Success means that a user can:

1. open a full-custom or care-plan template to view, edit, or fill it;
2. save a newly filled template as a response;
3. find that response in one workspace-wide library and filter by type or
   template;
4. reopen and update the same response without generating a new ID;
5. view or print the latest saved response as HTML; and
6. retain the original template structure when its source template is later
   changed.

Out of scope: collaboration, permissions, response version history, template
deletion/migration, and changing the existing template authoring models.

## Chosen approach

Use one shared response envelope and library for both template types. The
envelope contains a `kind`, a stable `id`, the source `templateId`, timestamps,
a complete template snapshot, and type-specific entered data. The library
uses those common fields for filtering and listing, while each type has its
own editor and renderer adapter.

This is preferred over separate response stores and pages because it gives the
user one predictable destination without forcing full-custom and semi-custom
data into an artificial shared form schema. Storing only a reference to the
live template was rejected because it would silently change historical
responses after template edits. A generic schema-driven care-plan editor was
also rejected: its configuration has clear, small field families, so a focused
generated editor is easier to understand and render.

## Data model and persistence

Create a `SavedResponse` union:

```ts
type ResponseKind = 'full-custom' | 'semi-care-plan';

type ResponseBase = {
  id: string;
  kind: ResponseKind;
  templateId: string;
  templateName: string;
  createdAt: string;
  updatedAt: string;
};

type FullCustomResponse = ResponseBase & {
  kind: 'full-custom';
  templateSnapshot: TemplateDocument;
  formData: Record<string, unknown>;
};

type SemiCarePlanResponse = ResponseBase & {
  kind: 'semi-care-plan';
  templateSnapshot: SemiCarePlanTemplate;
  formData: SemiCarePlanResponseData;
};
```

`SemiCarePlanResponseData` mirrors the care-plan template rather than using
DOM field names: participant fields, general-information groups, shared SERV
information, and a per-SERV record. Each service record may have schedule
values, item-list rows keyed by configured columns, and narrative values
keyed by the enabled subform sections. Empty/optional sections are omitted.

Store each response in a new `responses/` directory under the existing data
root. Filenames are the generated stable response ID, not a timestamp-based
template filename. Creating a response records both timestamps. Updating one
keeps `id` and `createdAt`, replaces only the editable form data, and updates
`updatedAt`. The server preserves the initial template snapshot during an
update, so the browser cannot accidentally rebind a historical response to a
new template revision.

Existing submission files remain readable and untouched; the new library is
the supported lifecycle for newly saved responses.

## HTTP interface

Add response endpoints using the shared envelope:

- `GET /api/responses?kind=&templateId=` lists response metadata, newest
  updated first;
- `POST /api/responses` creates a full snapshot response after validating the
  referenced source template and payload;
- `GET /api/responses/:id` retrieves the response for editing;
- `PATCH /api/responses/:id` updates its data in place;
- `GET /api/responses/:id/html` renders the saved snapshot and latest saved
  data into standalone HTML.

Invalid kinds, missing templates, unknown response IDs, or malformed
type-specific data return clear 4xx JSON errors. Updating a response with a
different kind/template ID/snapshot is rejected. This makes the snapshot and
identity invariants server-owned.

The existing live-template print endpoints remain available. Semi template
HTML remains the template preview endpoint; the new response HTML endpoint is
the completed-record view.

## Frontend workflows

### Shared response library

Expose a `/responses` route from the existing navigation. The page has:

- kind filter (`All`, `Full-custom`, `Care plans`);
- template filter populated from the response list/template metadata;
- response rows with template name, type, created/updated timestamps;
- actions to open/edit the saved response and view its saved HTML.

The list is intentionally record-centric, not a tab embedded inside each
template editor. Both authoring workspaces link into it, optionally with a
type/template filter pre-applied.

### Full-custom templates and responses

Keep the existing full-custom template library and editor. Its Fill action
creates a new response from the current saved template. Opening an existing
full-custom response loads the response's snapshot into the existing form
renderer and its saved `formData`; Save updates that response rather than
posting a new submission. View HTML opens the server-rendered saved record.

### Semi-custom care plans and responses

Turn the care-plan entry point into a small template library with New, View,
Edit, and Fill actions, while retaining the current multi-step authoring
workflow for create/edit. Fill opens a generated care-plan form from the
saved template snapshot. It renders participant and general-information
inputs, shared SERV fields, text areas for enabled narrative sections,
schedule controls appropriate to the configured format, and add/remove/edit
rows for configured item lists. Opening a saved care-plan response uses the
same generated form with saved values and updates in place.

The semi renderer receives a snapshot plus response data and outputs the same
care-plan outline as the existing template preview, populated with saved
values. It must HTML-escape all user-entered values.

## Error handling and compatibility

Loading or saving errors are shown in the owning workspace without discarding
unsaved in-memory input. A response whose original template no longer exists
still opens and renders because it depends on its snapshot. Template list
operations retain their current behavior. No existing saved templates,
semi-subforms, semi-care-plans, or legacy submissions are rewritten.

## Test strategy

Add API/store tests for creation, stable-ID updates, list filters, snapshot
preservation after template mutation, malformed payload rejection, and saved
HTML rendering. Add renderer tests verifying populated and escaped values for
both response kinds. Add React tests for response-library filtering and the
main full-custom/semi response editor flows, including care-plan item-list row
editing. Run the whole test suite and production build before handoff.
