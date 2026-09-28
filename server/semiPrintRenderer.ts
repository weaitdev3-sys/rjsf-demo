import Handlebars from 'handlebars';
import type { SemiCarePlanTemplate, SemiSubformConfiguration } from '../src/domain/semiCustom';
import type { SemiCarePlanResponseData } from '../src/domain/response';

type RenderedService = {
  label: string;
  subformName?: string;
  schedule?: string;
  scheduleValue?: string;
  itemListColumns?: string[];
  itemListRows?: string[][];
  sections: { label: string; value: string }[];
};

type SemiPrintDocument = {
  title: string;
  participantFields: { label: string; value: string }[];
  generalInfo: { label: string; fields: { label: string; value: string }[] }[];
  sharedServInfo: { label: string; value: string }[];
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
  health: 'Health Summary', support: 'Support', emergency: 'Emergency',
};

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
    h1 { font-size: 20pt; margin: 0 0 8mm; } h2 { font-size: 13pt; margin: 6mm 0 3mm; } h3 { font-size: 11pt; margin: 4mm 0 2mm; }
    section { break-inside: avoid; page-break-inside: avoid; } .field-list { margin: 0; padding-left: 5mm; } .field-list li { margin: 1mm 0; }
    .service { border: 1px solid #d1d5db; border-radius: 2mm; margin-top: 4mm; padding: 4mm; } .detail { margin: 2mm 0; } table { border-collapse: collapse; margin-top: 2mm; width: 100%; } th, td { border: 1px solid #d1d5db; padding: 2mm; text-align: left; } th { background: #f3f4f6; }
    @media print { body { background: #fff; padding: 0; } .print-page { box-shadow: none; margin: 0; min-height: 0; padding: 0; width: auto; } }
  </style>
</head>
<body><main class="print-page"><h1>{{title}}</h1>
{{#if participantFields.length}}<section><h2>Participant Details</h2><ul class="field-list">{{#each participantFields}}<li><strong>{{label}}:</strong> {{value}}</li>{{/each}}</ul></section>{{/if}}
{{#each generalInfo}}<section><h2>{{label}}</h2><ul class="field-list">{{#each fields}}<li><strong>{{label}}:</strong> {{value}}</li>{{/each}}</ul></section>{{/each}}
{{#if sharedServInfo.length}}<section><h2>SERV Info</h2><ul class="field-list">{{#each sharedServInfo}}<li><strong>{{label}}:</strong> {{value}}</li>{{/each}}</ul></section>{{/if}}
{{#each services}}<section class="service"><h2>{{label}}</h2>{{#if subformName}}<div class="detail"><strong>Subform:</strong> {{subformName}}</div>{{/if}}{{#if schedule}}<div class="detail"><strong>Schedule:</strong> {{schedule}} {{scheduleValue}}</div>{{/if}}{{#if itemListColumns.length}}<div class="detail"><strong>Item list</strong><table><thead><tr>{{#each itemListColumns}}<th>{{this}}</th>{{/each}}</tr></thead><tbody>{{#each itemListRows}}<tr>{{#each this}}<td>{{this}}</td>{{/each}}</tr>{{/each}}</tbody></table></div>{{/if}}{{#if sections.length}}<div class="detail"><strong>Sections</strong><ul class="field-list">{{#each sections}}<li><strong>{{label}}:</strong> {{value}}</li>{{/each}}</ul></div>{{/if}}</section>{{/each}}
</main></body></html>`);

function mapSubform(configuration: SemiSubformConfiguration, data?: SemiCarePlanResponseData['services'][string]): Pick<RenderedService, 'schedule' | 'scheduleValue' | 'itemListColumns' | 'itemListRows' | 'sections'> {
  return {
    ...(configuration.schedule ? { schedule: configuration.schedule.timeFormat === 'duration' ? 'Duration (hours)' : 'Start–end time', scheduleValue: Object.values(data?.schedule ?? {}).join(' – ') } : {}),
    ...(configuration.itemList ? { itemListColumns: configuration.itemList.columns, itemListRows: (data?.itemList?.length ? data.itemList : [Object.fromEntries(configuration.itemList.columns.map((column) => [column, '']))]).map((row) => configuration.itemList!.columns.map((column) => row[column] ?? '')) } : {}),
    sections: Object.entries(configuration.sections ?? {}).filter(([, enabled]) => enabled).map(([key]) => ({ label: sectionLabels[key] ?? key, value: data?.sections?.[key] ?? '' })),
  };
}

export function mapSemiCarePlanDocument(carePlan: SemiCarePlanTemplate, formData?: SemiCarePlanResponseData): SemiPrintDocument {
  const assignments = new Map((carePlan.assignments ?? []).map((assignment) => [assignment.serviceCode, assignment.subform]));
  return {
    title: carePlan.name,
    participantFields: (carePlan.participantFields ?? []).map((label) => ({ label, value: formData?.participant[label] ?? '' })),
    generalInfo: Object.entries(carePlan.generalInfo ?? {}).filter(([, fields]) => fields.length).map(([key, fields]) => ({ label: generalInfoLabels[key] ?? key, fields: fields.map((label) => ({ label, value: formData?.generalInfo[key]?.[label] ?? '' })) })),
    sharedServInfo: Object.entries(carePlan.servInfo ?? {}).filter(([, enabled]) => Boolean(enabled)).map(([key]) => ({ label: sectionLabels[key] ?? (key === 'schedule' ? 'Consolidated schedule' : key === 'itemList' ? 'Consolidated item list' : key), value: formData?.servInfo[key] ?? '' })),
    services: carePlan.services.map((service) => {
      const subform = assignments.get(service.code);
      return { label: `${service.code} · ${service.name}`, ...(subform ? { subformName: subform.name, ...mapSubform(subform.configuration, formData?.services[service.code]) } : { sections: [] }) };
    }),
  };
}

export function renderSemiCarePlanHtml(carePlan: SemiCarePlanTemplate, formData?: SemiCarePlanResponseData): string {
  return pageTemplate(mapSemiCarePlanDocument(carePlan, formData));
}
