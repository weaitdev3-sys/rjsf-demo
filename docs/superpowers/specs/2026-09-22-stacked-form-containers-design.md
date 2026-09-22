# Stacked form containers

## Goal

Allow form authors to add a labeled container and place inputs inside it. A
container is a vertically stacked group, not a row/column layout system.

## Scope

- Add `container` as an editable block type.
- A container has a label, optional help text, and child input fields.
- Containers are top-level blocks only in this version. They cannot contain
  other containers or repeatable lists.
- Container children use the existing input configuration, ordering, and
  deletion interactions.
- The build canvas displays child inputs indented beneath their container.
- The generated JSON Schema represents a container as an object property and
  its children as that object's properties. Submitted response data is grouped
  beneath the container key.
- The fill view uses the generated schema, therefore rendering each container
  as a labeled object group.

## Data model and conversion

`EditableField` gains `container` as a field kind. It uses the existing
`children` property. The schema builder recursively converts container
children to an object schema and nested UI schema. Duplicate generated keys
are rejected within each object scope, while identical labels remain valid in
different containers.

Repeatable lists keep their existing item-object conversion. Their children
remain restricted to non-list, non-heading input fields. Containers are not a
general recursive layout tree in this change.

## Builder interaction

The palette exposes a Container action. When the selected top-level block is a
container, its settings show controls for adding permitted child inputs. A
child can be selected, edited, moved within its parent, and deleted. Container
settings allow label/help editing and delete the entire group.

## Verification

Add contract coverage for a container becoming a nested object in schema and
uiSchema, including its required child fields. Add builder coverage that an
author can add a container, add an input to it, and see that input on the
canvas. Run the focused tests, type/build checks, and the complete test suite.
