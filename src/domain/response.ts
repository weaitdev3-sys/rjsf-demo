import type { SemiCarePlanTemplate, SemiSubformConfiguration } from './semiCustom';
import type { TemplateDocument } from './templateSchema';

export type ResponseKind = 'full-custom' | 'semi-care-plan';

export type SemiServiceResponseData = {
  schedule?: Record<string, string>;
  itemList?: Record<string, string>[];
  sections?: Record<string, string>;
};

export type SemiCarePlanResponseData = {
  participant: Record<string, string>;
  generalInfo: Record<string, Record<string, string>>;
  servInfo: Record<string, string>;
  services: Record<string, SemiServiceResponseData>;
};

type ResponseBase = {
  id: string;
  kind: ResponseKind;
  templateId: string;
  templateName: string;
  createdAt: string;
  updatedAt: string;
};

export type FullCustomResponse = ResponseBase & {
  kind: 'full-custom';
  templateSnapshot: TemplateDocument;
  formData: Record<string, unknown>;
};

export type SemiCarePlanResponse = ResponseBase & {
  kind: 'semi-care-plan';
  templateSnapshot: SemiCarePlanTemplate;
  formData: SemiCarePlanResponseData;
};

export type SavedResponse = FullCustomResponse | SemiCarePlanResponse;

const strings = (fields: string[] = []) => Object.fromEntries(fields.map((field) => [field, '']));
const enabledSections = (configuration: SemiSubformConfiguration) => Object.fromEntries(Object.entries(configuration.sections ?? {}).filter(([, enabled]) => enabled).map(([key]) => [key, '']));

function fromConfiguration(configuration: SemiSubformConfiguration): SemiServiceResponseData {
  return {
    ...(configuration.schedule ? { schedule: configuration.schedule.timeFormat === 'duration' ? { duration: '' } : { start: '', end: '' } } : {}),
    ...(configuration.itemList ? { itemList: [strings(configuration.itemList.columns)] } : {}),
    ...(Object.keys(enabledSections(configuration)).length ? { sections: enabledSections(configuration) } : {}),
  };
}

export function createEmptySemiCarePlanResponseData(template: SemiCarePlanTemplate): SemiCarePlanResponseData {
  const assignments = new Map((template.assignments ?? []).map((assignment) => [assignment.serviceCode, assignment.subform.configuration]));
  return {
    participant: strings(template.participantFields),
    generalInfo: Object.fromEntries(Object.entries(template.generalInfo ?? {}).map(([group, fields]) => [group, strings(fields)])),
    servInfo: Object.fromEntries(Object.entries(template.servInfo ?? {}).filter(([, enabled]) => Boolean(enabled)).map(([key]) => [key, ''])),
    services: Object.fromEntries(template.services.map((service) => [service.code, assignments.has(service.code) ? fromConfiguration(assignments.get(service.code)!) : {}])),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isStringRecord = (value: unknown): value is Record<string, string> => isRecord(value) && Object.values(value).every((item) => typeof item === 'string');

export function isSemiCarePlanResponseData(value: unknown): value is SemiCarePlanResponseData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Partial<SemiCarePlanResponseData>;
  if (!isStringRecord(data.participant) || !isStringRecord(data.servInfo) || !isRecord(data.generalInfo) || !isRecord(data.services)) return false;
  if (!Object.values(data.generalInfo).every(isStringRecord)) return false;
  return Object.values(data.services).every((service) => {
    if (!isRecord(service)) return false;
    return (service.schedule === undefined || isStringRecord(service.schedule)) &&
      (service.sections === undefined || isStringRecord(service.sections)) &&
      (service.itemList === undefined || (Array.isArray(service.itemList) && service.itemList.every(isStringRecord)));
  });
}
