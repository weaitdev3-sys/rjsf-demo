import Handlebars from 'handlebars';
import type { SemiCarePlanTemplate, SemiSubformConfiguration } from '../src/domain/semiCustom';
import type { SemiCarePlanResponseData } from '../src/domain/response';

type PrintField = { label: string; value: string };

type RenderedService = {
  label: string;
  subformName?: string;
  schedule?: string;
  scheduleValue?: string;
  itemListColumns?: string[];
  itemListRows?: string[][];
  sections: PrintField[];
};

type SemiPrintDocument = {
  title: string;
  participantFields: PrintField[];
  generalInfo: { label: string; fields: PrintField[] }[];
  sharedServInfo: PrintField[];
  services: RenderedService[];
};

const sectionLabels: Record<string, string> = {
  careNeeds: 'Care Needs',
  participantGoals: 'Participant Goals',
  supportStrategies: 'Support Strategies',
  areasOfDifficulty: 'Areas of Difficulty and Existing Arrangements',
  sahRelevantInfo: 'Relevant Information on SAH Support Plan',
  remarks: 'Remarks',
  outcomeReviews: 'Outcome Reviews',
};

const generalInfoLabels: Record<string, string> = {
  health: 'Health Summary',
  support: 'Support',
  emergency: 'Emergency',
};

const fieldTableTemplate = Handlebars.compile(`
  <table class="print-field-table">
    <tbody>
      {{#each fields}}
        <tr>
          <th>{{label}}</th>
          <td>{{value}}</td>
        </tr>
      {{/each}}
    </tbody>
  </table>
`);

Handlebars.registerPartial('semiFieldTable', fieldTableTemplate);

const pageTemplate = Handlebars.compile(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>{{title}}</title>
    <style>
      @page { size: A4; margin: 16mm; }

      * { box-sizing: border-box; }

      body {
        background: #e5e7eb;
        color: #1f2937;
        font-family: Arial, sans-serif;
        font-size: 10.5pt;
        line-height: 1.4;
        margin: 0;
        padding: 12mm 0;
      }

      .print-page {
        background: #fff;
        box-shadow: 0 2mm 8mm rgb(0 0 0 / 18%);
        margin: 0 auto;
        min-height: 297mm;
        padding: 16mm;
        width: 210mm;
      }

      h1 { font-size: 20pt; margin: 0 0 8mm; }
      h2 { font-size: 13pt; margin: 6mm 0 3mm; }
      h3 { font-size: 11pt; margin: 4mm 0 2mm; }

      section { break-inside: avoid; page-break-inside: avoid; }

      .print-field-table,
      .print-detail-table,
      .print-item-list {
        border-collapse: collapse;
        margin-top: 2mm;
        width: 100%;
      }

      .print-field-table th,
      .print-field-table td,
      .print-detail-table th,
      .print-detail-table td,
      .print-item-list th,
      .print-item-list td {
        border: 1px solid #d1d5db;
        padding: 2mm;
        text-align: left;
        vertical-align: top;
      }

      .print-field-table th,
      .print-detail-table th,
      .print-item-list th {
        background: #f3f4f6;
        font-size: 9pt;
      }

      .print-field-table th,
      .print-detail-table th { width: 38%; }

      .print-field-table td,
      .print-detail-table td,
      .print-item-list td {
        min-height: 8mm;
        white-space: pre-wrap;
      }

      .service {
        border: 1px solid #d1d5db;
        border-radius: 2mm;
        margin-top: 4mm;
        padding: 4mm;
      }

      .detail { margin: 3mm 0; }
      .print-narrative { margin-top: 4mm; }
      .print-narrative h3 { color: #4b5563; font-size: 9pt; margin-bottom: 1mm; }
      .print-answer { border-bottom: 1px solid #d1d5db; min-height: 8mm; white-space: pre-wrap; }

      @media print {
        body { background: #fff; padding: 0; }
        .print-page { box-shadow: none; margin: 0; min-height: 0; padding: 0; width: auto; }
      }
    </style>
  </head>
  <body>
    <main class="print-page">
      <h1>{{title}}</h1>

      {{#if participantFields.length}}
        <section>
          <h2>Participant Details</h2>
          {{> semiFieldTable fields=participantFields}}
        </section>
      {{/if}}

      {{#each generalInfo}}
        <section>
          <h2>{{label}}</h2>
          {{> semiFieldTable fields=fields}}
        </section>
      {{/each}}

      {{#if sharedServInfo.length}}
        <section>
          <h2>SERV Info</h2>
          {{> semiFieldTable fields=sharedServInfo}}
        </section>
      {{/if}}

      {{#each services}}
        <section class="service">
          <h2>{{label}}</h2>

          <table class="print-detail-table">
            <tbody>
              {{#if subformName}}
                <tr><th>Subform</th><td>{{subformName}}</td></tr>
              {{/if}}
              {{#if schedule}}
                <tr><th>Schedule</th><td>{{schedule}} {{scheduleValue}}</td></tr>
              {{/if}}
            </tbody>
          </table>

          {{#if itemListColumns.length}}
            <div class="detail">
              <h3>Item list</h3>
              <table class="print-item-list">
                <thead>
                  <tr>{{#each itemListColumns}}<th>{{this}}</th>{{/each}}</tr>
                </thead>
                <tbody>
                  {{#each itemListRows}}
                    <tr>{{#each this}}<td>{{this}}</td>{{/each}}</tr>
                  {{/each}}
                </tbody>
              </table>
            </div>
          {{/if}}

          {{#each sections}}
            <section class="print-narrative">
              <h3>{{label}}</h3>
              <div class="print-answer">{{value}}</div>
            </section>
          {{/each}}
        </section>
      {{/each}}
    </main>
  </body>
</html>`);

function mapSubform(
  configuration: SemiSubformConfiguration,
  data?: SemiCarePlanResponseData['services'][string],
): Pick<
  RenderedService,
  'schedule' | 'scheduleValue' | 'itemListColumns' | 'itemListRows' | 'sections'
> {
  const schedule = configuration.schedule
    ? {
        schedule:
          configuration.schedule.timeFormat === 'duration' ? 'Duration (hours)' : 'Start–end time',
        scheduleValue: Object.values(data?.schedule ?? {}).join(' – '),
      }
    : {};
  const itemList = configuration.itemList
    ? {
        itemListColumns: configuration.itemList.columns,
        itemListRows: mapItemListRows(configuration.itemList.columns, data?.itemList),
      }
    : {};

  return { ...schedule, ...itemList, sections: mapNarrativeSections(configuration, data) };
}

function mapItemListRows(columns: string[], rows?: Record<string, string>[]): string[][] {
  const sourceRows = rows?.length
    ? rows
    : [Object.fromEntries(columns.map((column) => [column, '']))];
  return sourceRows.map((row) => columns.map((column) => row[column] ?? ''));
}

function mapNarrativeSections(
  configuration: SemiSubformConfiguration,
  data?: SemiCarePlanResponseData['services'][string],
): PrintField[] {
  return Object.entries(configuration.sections ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => ({ label: sectionLabels[key] ?? key, value: data?.sections?.[key] ?? '' }));
}

function mapFields(labels: string[], values: Record<string, string> | undefined): PrintField[] {
  return labels.map((label) => ({ label, value: values?.[label] ?? '' }));
}

export function mapSemiCarePlanDocument(
  carePlan: SemiCarePlanTemplate,
  formData?: SemiCarePlanResponseData,
): SemiPrintDocument {
  const assignments = new Map(
    (carePlan.assignments ?? []).map((assignment) => [assignment.serviceCode, assignment.subform]),
  );

  return {
    title: carePlan.name,
    participantFields: mapFields(carePlan.participantFields ?? [], formData?.participant),
    generalInfo: Object.entries(carePlan.generalInfo ?? {})
      .filter(([, fields]) => fields.length)
      .map(([key, fields]) => ({
        label: generalInfoLabels[key] ?? key,
        fields: mapFields(fields, formData?.generalInfo[key]),
      })),
    sharedServInfo: Object.entries(carePlan.servInfo ?? {})
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => ({
        label:
          sectionLabels[key] ??
          (key === 'schedule'
            ? 'Consolidated schedule'
            : key === 'itemList'
              ? 'Consolidated item list'
              : key),
        value: formData?.servInfo[key] ?? '',
      })),
    services: carePlan.services.map((service) => {
      const subform = assignments.get(service.code);
      return {
        label: `${service.code} · ${service.name}`,
        ...(subform
          ? {
              subformName: subform.name,
              ...mapSubform(subform.configuration, formData?.services[service.code]),
            }
          : { sections: [] }),
      };
    }),
  };
}

export function renderSemiCarePlanHtml(
  carePlan: SemiCarePlanTemplate,
  formData?: SemiCarePlanResponseData,
): string {
  return pageTemplate(mapSemiCarePlanDocument(carePlan, formData));
}
