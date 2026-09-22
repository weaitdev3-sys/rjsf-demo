import type { RJSFSchema, UiSchema } from '@rjsf/utils';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'heading';

export type EditableField = {
  id: string;
  kind: FieldKind;
  label: string;
  required?: boolean;
  help?: string;
  options?: string[];
  minimum?: number;
  maximum?: number;
  rows?: number;
};

export type TemplateDocument = {
  id?: string;
  name: string;
  schema: RJSFSchema;
  uiSchema: UiSchema;
  fields?: EditableField[];
  createdAt?: string;
  updatedAt?: string;
};

const propertyName = (id: string) =>
  id.replace(/[^a-zA-Z0-9]+(.)/g, (_, character: string) => character.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '') || 'field';

export function buildTemplateDocument(name: string, fields: EditableField[]): TemplateDocument {
  const properties: Record<string, RJSFSchema> = {};
  const uiSchema: UiSchema = {};
  const required: string[] = [];

  for (const field of fields) {
    if (field.kind === 'heading') continue;
    const key = propertyName(field.id);
    const schema: RJSFSchema = {
      type: field.kind === 'number' ? 'number' : field.kind === 'checkbox' ? 'boolean' : 'string',
      title: field.label
    };
    if (field.help) schema.description = field.help;
    if (field.options?.length) schema.enum = field.options;
    if (field.minimum !== undefined) schema.minimum = field.minimum;
    if (field.maximum !== undefined) schema.maximum = field.maximum;
    properties[key] = schema;
    uiSchema[key] = { 'ui:widget': field.kind === 'phone' ? 'tel' : field.kind === 'checkbox' ? 'checkbox' : field.kind };
    if (field.required) required.push(key);
  }

  return {
    name,
    fields,
    schema: { title: name, type: 'object', properties, ...(required.length ? { required } : {}) },
    uiSchema
  };
}
