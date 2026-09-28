import Handlebars from 'handlebars';
import type { SemiCarePlanTemplate, SemiSubformConfiguration } from '../src/domain/semiCustom';

type RenderedService = {
  label: string;
  subformName?: string;
  schedule?: string;
  itemListColumns?: string[];
  sections: string[];
};

type SemiPrintDocument = {
  title: string;
  participantFields: string[];
  generalInfo: { label: string; fields: string[] }[];
  sharedServInfo: string[];
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
{{#if participantFields.length}}<section><h2>Participant Details</h2><ul class="field-list">{{#each participantFields}}<li>{{this}}</li>{{/each}}</ul></section>{{/if}}
{{#each generalInfo}}<section><h2>{{label}}</h2><ul class="field-list">{{#each fields}}<li>{{this}}</li>{{/each}}</ul></section>{{/each}}
{{#if sharedServInfo.length}}<section><h2>SERV Info</h2><ul class="field-list">{{#each sharedServInfo}}<li>{{this}}</li>{{/each}}</ul></section>{{/if}}
{{#each services}}<section class="service"><h2>{{label}}</h2>{{#if subformName}}<div class="detail"><strong>Subform:</strong> {{subformName}}</div>{{/if}}{{#if schedule}}<div class="detail"><strong>Schedule:</strong> {{schedule}}</div>{{/if}}{{#if itemListColumns.length}}<div class="detail"><strong>Item list</strong><table><thead><tr>{{#each itemListColumns}}<th>{{this}}</th>{{/each}}</tr></thead><tbody><tr>{{#each itemListColumns}}<td></td>{{/each}}</tr></tbody></table></div>{{/if}}{{#if sections.length}}<div class="detail"><strong>Sections</strong><ul class="field-list">{{#each sections}}<li>{{this}}</li>{{/each}}</ul></div>{{/if}}</section>{{/each}}
</main></body></html>`);

function mapSubform(configuration: SemiSubformConfiguration): Pick<RenderedService, 'schedule' | 'itemListColumns' | 'sections'> {
  return {
    ...(configuration.schedule ? { schedule: configuration.schedule.timeFormat === 'duration' ? 'Duration (hours)' : 'Start–end time' } : {}),
    ...(configuration.itemList ? { itemListColumns: configuration.itemList.columns } : {}),
    sections: Object.entries(configuration.sections ?? {}).filter(([, enabled]) => enabled).map(([key]) => sectionLabels[key] ?? key),
  };
}

export function mapSemiCarePlanDocument(carePlan: SemiCarePlanTemplate): SemiPrintDocument {
  const assignments = new Map((carePlan.assignments ?? []).map((assignment) => [assignment.serviceCode, assignment.subform]));
  return {
    title: carePlan.name,
    participantFields: carePlan.participantFields ?? [],
    generalInfo: Object.entries(carePlan.generalInfo ?? {}).filter(([, fields]) => fields.length).map(([key, fields]) => ({ label: generalInfoLabels[key] ?? key, fields })),
    sharedServInfo: Object.entries(carePlan.servInfo ?? {}).filter(([, enabled]) => Boolean(enabled)).map(([key]) => sectionLabels[key] ?? (key === 'schedule' ? 'Consolidated schedule' : key === 'itemList' ? 'Consolidated item list' : key)),
    services: carePlan.services.map((service) => {
      const subform = assignments.get(service.code);
      return { label: `${service.code} · ${service.name}`, ...(subform ? { subformName: subform.name, ...mapSubform(subform.configuration) } : { sections: [] }) };
    }),
  };
}

export function renderSemiCarePlanHtml(carePlan: SemiCarePlanTemplate): string {
  return pageTemplate(mapSemiCarePlanDocument(carePlan));
}
