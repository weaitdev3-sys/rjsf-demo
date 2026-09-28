import Handlebars from 'handlebars';
import {
  buildFieldKeyMap,
  evaluateVisibleFields,
  flattenTemplateFields,
  type EditableField,
  type TemplateDocument,
} from '../src/domain/templateSchema';

type PrintBlock = {
  kind: 'heading' | 'text' | 'field' | 'section' | 'columns' | 'tabs' | 'list';
  label?: string;
  content?: string;
  value?: string;
  children?: PrintBlock[];
  left?: PrintBlock[];
  right?: PrintBlock[];
  panels?: { label: string; children: PrintBlock[] }[];
  headers?: string[];
  rows?: string[][];
};

type PrintDocument = { title: string; blocks: PrintBlock[] };

const blockTemplate = Handlebars.compile(`{{#each blocks}}
{{#if (eq kind "heading")}}<h2 class="print-heading">{{label}}</h2>
{{else if (eq kind "text")}}<p class="print-text">{{content}}</p>
{{else if (eq kind "field")}}<section class="print-field"><div class="print-label">{{label}}</div><div class="print-value">{{value}}</div></section>
{{else if (eq kind "section")}}<section class="print-section">{{#if label}}<h2>{{label}}</h2>{{/if}}{{> printBlocks blocks=children}}</section>
{{else if (eq kind "columns")}}<section class="print-columns">{{#if label}}<h2>{{label}}</h2>{{/if}}<div class="print-columns-grid"><div>{{> printBlocks blocks=left}}</div><div>{{> printBlocks blocks=right}}</div></div></section>
{{else if (eq kind "tabs")}}<section class="print-tabs">{{#if label}}<h2>{{label}}</h2>{{/if}}{{#each panels}}<section class="print-tab"><h3>{{label}}</h3>{{> printBlocks blocks=children}}</section>{{/each}}</section>
{{else if (eq kind "list")}}<section class="print-list"><h2>{{label}}</h2><table><thead><tr>{{#each headers}}<th>{{this}}</th>{{/each}}</tr></thead><tbody>{{#each rows}}<tr>{{#each this}}<td>{{this}}</td>{{/each}}</tr>{{/each}}</tbody></table></section>
{{/if}}
{{/each}}`);

Handlebars.registerHelper('eq', (left: unknown, right: unknown) => left === right);
Handlebars.registerPartial('printBlocks', blockTemplate);

const pageTemplate = Handlebars.compile(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{{title}}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { background: #e5e7eb; color: #1f2937; font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; margin: 0; padding: 12mm 0; }
    .print-page { background: #fff; box-shadow: 0 2mm 8mm rgb(0 0 0 / 18%); margin: 0 auto; min-height: 297mm; padding: 16mm; width: 210mm; }
    h1 { font-size: 20pt; margin: 0 0 8mm; }
    h2 { font-size: 13pt; margin: 6mm 0 3mm; }
    h3 { font-size: 11pt; margin: 4mm 0 2mm; }
    .print-heading { border-bottom: 1px solid #9ca3af; padding-bottom: 2mm; }
    .print-text { margin: 0 0 4mm; white-space: pre-wrap; }
    .print-field, .print-section, .print-columns, .print-tab, .print-list { break-inside: avoid; page-break-inside: avoid; }
    .print-field { border-bottom: 1px solid #d1d5db; margin: 0 0 3mm; padding: 0 0 2mm; }
    .print-label { color: #4b5563; font-size: 9pt; font-weight: 700; margin-bottom: 1mm; }
    .print-value { min-height: 5mm; white-space: pre-wrap; }
    .print-columns-grid { display: grid; gap: 7mm; grid-template-columns: 1fr 1fr; }
    .print-list table { border-collapse: collapse; width: 100%; }
    .print-list th, .print-list td { border: 1px solid #d1d5db; padding: 2mm; text-align: left; vertical-align: top; }
    .print-list th { background: #f3f4f6; font-size: 9pt; }
    .print-list td { height: 8mm; white-space: pre-wrap; }
    @media print { body { background: #fff; padding: 0; } .print-page { box-shadow: none; margin: 0; min-height: 0; padding: 0; width: auto; } .print-columns-grid { gap: 6mm; } }
  </style>
</head>
<body>
  <main class="print-page"><h1>{{title}}</h1>{{> printBlocks blocks=blocks}}</main>
</body>
</html>`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const printableValue = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(printableValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

function mapFields(
  fields: EditableField[],
  data: unknown,
  fieldKeys: ReadonlyMap<string, string>,
): PrintBlock[] {
  const values = isRecord(data) ? data : {};
  return fields.map((field): PrintBlock => {
    if (field.kind === 'heading') return { kind: 'heading', label: field.label };
    if (field.kind === 'textLayout') return { kind: 'text', content: field.content ?? '' };
    if (field.kind === 'twoColumn')
      return {
        kind: 'columns',
        label: field.label,
        left: mapFields(field.leftChildren ?? [], values, fieldKeys),
        right: mapFields(field.rightChildren ?? [], values, fieldKeys),
      };
    if (field.kind === 'tabs')
      return {
        kind: 'tabs',
        label: field.label,
        panels: (field.tabs ?? []).map((tab) => ({
          label: tab.label,
          children: mapFields(tab.fields, values, fieldKeys),
        })),
      };

    const value = values[fieldKeys.get(field.id) ?? ''];
    if (field.kind === 'container')
      return {
        kind: 'section',
        label: field.showLabel === false ? undefined : field.label,
        children: mapFields(field.children ?? [], value, fieldKeys),
      };
    if (field.kind === 'list')
      return {
        kind: 'list',
        label: field.label,
        headers: (field.children ?? []).map((child) => child.label),
        rows:
          Array.isArray(value) && value.length
            ? value.map((row) =>
                (field.children ?? []).map((child) =>
                  printableValue(isRecord(row) ? row[fieldKeys.get(child.id) ?? ''] : undefined),
                ),
              )
            : [(field.children ?? []).map(() => '')],
      };
    return { kind: 'field', label: field.label, value: printableValue(value) };
  });
}

function mapSchema(schema: Record<string, unknown>, data: unknown): PrintBlock[] {
  const values = isRecord(data) ? data : {};
  const properties = isRecord(schema.properties) ? schema.properties : {};
  return Object.entries(properties).map(([key, definition]): PrintBlock => {
    const property = isRecord(definition) ? definition : {};
    const label = typeof property.title === 'string' ? property.title : key;
    const value = values[key];
    if (property.type === 'object')
      return { kind: 'section', label, children: mapSchema(property, value) };
    if (property.type === 'array' && isRecord(property.items) && property.items.type === 'object') {
      const itemProperties = isRecord(property.items.properties) ? property.items.properties : {};
      const entries = Object.entries(itemProperties);
      return {
        kind: 'list',
        label,
        headers: entries.map(([key, item]) =>
          isRecord(item) && typeof item.title === 'string' ? item.title : key,
        ),
        rows:
          Array.isArray(value) && value.length
            ? value.map((row) =>
                entries.map(([key]) => printableValue(isRecord(row) ? row[key] : undefined)),
              )
            : [entries.map(() => '')],
      };
    }
    return { kind: 'field', label, value: printableValue(value) };
  });
}

export function mapPrintableDocument(template: TemplateDocument, formData: unknown): PrintDocument {
  const fields = template.pages?.length ? flattenTemplateFields(template.pages) : template.fields;
  return {
    title: template.name,
    blocks: fields?.length
      ? mapFields(evaluateVisibleFields(fields, formData), formData, buildFieldKeyMap(fields))
      : mapSchema(template.schema as Record<string, unknown>, formData),
  };
}

export function renderPrintableHtml(template: TemplateDocument, formData: unknown): string {
  return pageTemplate(mapPrintableDocument(template, formData));
}
