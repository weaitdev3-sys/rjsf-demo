# Layout blocks and autocomplete fields

## Goal

Expand the form builder with layout-specific palette controls, static text,
two-column visual layouts, an optional container label, and searchable
autocomplete fields.

## Palette

The builder presents two palette panels:

- **Fields:** existing data-entry fields, repeatable lists, and Autocomplete.
- **Layout:** Container, Heading, Text, and Two-column.

The child palettes for containers and columns expose data-entry fields only.
They do not allow layout blocks, lists, or nested containers.

## Field model

`EditableField` gains:

- `autocomplete`, a string field with an author-provided option list.
- `text`, a static layout block with editable `content`.
- `twoColumn`, a visual layout block with `leftChildren` and `rightChildren`.
- `showLabel?: boolean` for containers; the default is `true`.

Containers continue to own one stacked child list and produce a nested object
in response data. A two-column layout is presentation-only: its children are
serialized into the enclosing object scope, in left-column order followed by
right-column order. Text and headings are presentation-only and produce no
response data. Duplicate field keys are rejected in the enclosing scope,
including across two columns.

## Builder interaction

Container settings include a checked-by-default `Show label` checkbox. A
two-column layout renders and configures distinct Left column and Right column
child lists. Selecting a child preserves the parent layout and column context
for editing, reordering, and removal. Static text exposes a content editor in
settings. The canvas renders containers as stacked groups and two-column
layouts with adjacent vertical columns.

## Form rendering

Container UI schema hides the object title when `showLabel` is false while
keeping the nested response object. Text and headings render in the fill view
outside RJSF. Two-column layouts render adjacent columns in build mode; RJSF
continues to render their flattened fields in response order in fill mode.

Autocomplete uses a string enum and the Mantine RJSF select widget. That
widget is searchable, providing type-to-filter behavior without a new custom
widget or dependency.

## Verification

Add schema tests for autocomplete options, a hidden container label, static
text omission, flattened two-column fields, and duplicate keys across columns.
Add builder tests for palette separation, the container label toggle, static
text editing, two-column child authoring, and autocomplete configuration. Run
focused tests, the full suite, and the production build.
