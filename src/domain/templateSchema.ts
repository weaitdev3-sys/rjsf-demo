import type { RJSFSchema, UiSchema } from '@rjsf/utils';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'time'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'autocomplete'
  | 'heading'
  | 'list'
  | 'container'
  | 'textLayout'
  | 'twoColumn';

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
  children?: EditableField[];
  showLabel?: boolean;
  content?: string;
  leftChildren?: EditableField[];
  rightChildren?: EditableField[];
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

export const propertyName = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';

const uniquePropertyName = (base: string, properties: Record<string, RJSFSchema>) => {
  if (!properties[base]) return base;
  let suffix = 2;
  while (properties[`${base}_${suffix}`]) suffix += 1;
  return `${base}_${suffix}`;
};

export function buildTemplateDocument(name: string, fields: EditableField[]): TemplateDocument {
  const { schema, uiSchema } = buildObjectSchema(fields);
  return { name, fields, schema: { title: name, ...schema }, uiSchema };
}

function buildObjectSchema(fields: EditableField[]): { schema: RJSFSchema; uiSchema: UiSchema } {
  const properties: Record<string, RJSFSchema> = {};
  const uiSchema: UiSchema = {};
  const required: string[] = [];

  for (const field of fields) {
    if (field.kind === 'heading' || field.kind === 'textLayout') continue;
    if (field.kind === 'twoColumn') {
      const columns = buildObjectSchema([...(field.leftChildren ?? []), ...(field.rightChildren ?? [])]);
      for (const [key, schema] of Object.entries(columns.schema.properties ?? {})) {
        const uniqueKey = uniquePropertyName(key, properties);
        properties[uniqueKey] = schema as RJSFSchema;
        uiSchema[uniqueKey] = columns.uiSchema[key];
      }
      required.push(...((columns.schema.required as string[] | undefined) ?? []));
      continue;
    }
    const key = uniquePropertyName(propertyName(field.label), properties);
    const nestedObject = field.kind === 'list' || field.kind === 'container'
      ? buildObjectSchema(field.children ?? [])
      : undefined;
    const schema: RJSFSchema = field.kind === 'list'
      ? { type: 'array', title: field.label, items: nestedObject!.schema }
      : field.kind === 'container'
        ? { title: field.label, ...nestedObject!.schema }
      : { type: field.kind === 'number' ? 'number' : field.kind === 'checkbox' ? 'boolean' : 'string', title: field.label };
    if (field.help) schema.description = field.help;
    if (field.kind === 'date') schema.format = 'date';
    if (field.kind === 'time') schema.format = 'time';
    if (field.options?.length && field.kind !== 'list') schema.enum = field.options;
    if (field.minimum !== undefined) schema.minimum = field.minimum;
    if (field.maximum !== undefined) schema.maximum = field.maximum;
    properties[key] = schema;
    uiSchema[key] = field.kind === 'list'
      ? { items: nestedObject!.uiSchema }
      : field.kind === 'container'
        ? { ...(field.showLabel === false ? { 'ui:options': { label: false } } : {}), ...nestedObject!.uiSchema }
      : { 'ui:widget': field.kind === 'number' ? 'updown' : field.kind === 'phone' ? 'tel' : field.kind === 'checkbox' ? 'checkbox' : field.kind === 'autocomplete' ? 'select' : field.kind };
    if (field.required) required.push(key);
  }

  return { schema: { type: 'object', properties, ...(required.length ? { required } : {}) }, uiSchema };
}
