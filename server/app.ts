import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TemplateDocument } from '../src/domain/templateSchema';
import type { SemiCarePlanTemplate, SemiSubformTemplate } from '../src/domain/semiCustom';
import { isSemiCarePlanResponseData, type ResponseKind } from '../src/domain/response';
import { renderPrintableHtml } from './printRenderer';
import { renderSemiCarePlanHtml } from './semiPrintRenderer';
import { renderResponseHtml } from './responseRenderer';
import { TemplateStore } from './templateStore';

export function resolveStaticDirectory(moduleUrl: string): string {
  return fileURLToPath(new URL('../dist', moduleUrl));
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isSemiSubformConfiguration = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (value.schedule !== undefined && (!isRecord(value.schedule) || !['start-end', 'duration'].includes(value.schedule.timeFormat as string))) return false;
  if (value.itemList !== undefined && (!isRecord(value.itemList) || !isStringArray(value.itemList.columns))) return false;
  return value.sections === undefined || (isRecord(value.sections) && Object.values(value.sections).every((enabled) => typeof enabled === 'boolean'));
};
const isSemiCarePlan = (value: unknown): value is SemiCarePlanTemplate => {
  if (!isRecord(value) || typeof value.name !== 'string' || !['per-serv', 'consolidated', 'hybrid'].includes(value.structure as string) || !Array.isArray(value.services) || !value.services.every((service) => isRecord(service) && typeof service.code === 'string' && typeof service.name === 'string' && typeof service.category === 'string')) return false;
  if (value.participantFields !== undefined && !isStringArray(value.participantFields)) return false;
  if (value.generalInfo !== undefined && (!isRecord(value.generalInfo) || !Object.values(value.generalInfo).every(isStringArray))) return false;
  if (value.servInfo !== undefined && (!isRecord(value.servInfo) || !Object.values(value.servInfo).every((enabled) => typeof enabled === 'boolean'))) return false;
  return value.assignments === undefined || (Array.isArray(value.assignments) && value.assignments.every((assignment) => isRecord(assignment) && typeof assignment.serviceCode === 'string' && isRecord(assignment.subform) && typeof assignment.subform.id === 'string' && typeof assignment.subform.name === 'string' && isSemiSubformConfiguration(assignment.subform.configuration)));
};

export function createApp(storageRoot?: string) {
  const app = express();
  const store = new TemplateStore(storageRoot);
  const staticDirectory = resolveStaticDirectory(import.meta.url);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(staticDirectory));

  app.get('/api/semi/subforms', async (request, response, next) => {
    try { response.json(await store.listSemiSubforms(request.query.active === 'true')); } catch (error) { next(error); }
  });
  app.post('/api/semi/subforms', async (request, response, next) => {
    try {
      const template = request.body as SemiSubformTemplate;
      if (!template.name || typeof template.active !== 'boolean' || !template.configuration) return response.status(400).json({ error: 'name, active and configuration are required' });
      response.status(201).json(await store.saveSemiSubform(template));
    } catch (error) { next(error); }
  });
  app.patch('/api/semi/subforms/:id', async (request, response, next) => {
    try {
      const { active } = request.body as { active?: unknown };
      if (typeof active !== 'boolean') return response.status(400).json({ error: 'active is required' });
      response.json(await store.updateSemiSubformActive(request.params.id, active));
    } catch (error) { next(error); }
  });
  app.get('/api/semi/care-plans', async (_request, response, next) => {
    try { response.json(await store.listSemiCarePlans()); } catch (error) { next(error); }
  });
  app.get('/api/semi/care-plans/:id/html', async (request, response, next) => {
    try { response.type('html').send(renderSemiCarePlanHtml(await store.getSemiCarePlan(request.params.id))); } catch (error) { next(error); }
  });
  app.get('/api/semi/care-plans/:id', async (request, response, next) => {
    try { response.json(await store.getSemiCarePlan(request.params.id)); } catch (error) { next(error); }
  });
  app.post('/api/semi/care-plans', async (request, response, next) => {
    try {
      const template = request.body as unknown;
      if (!isSemiCarePlan(template) || !template.name) return response.status(400).json({ error: 'Invalid semi-custom care plan' });
      if (template.structure !== 'consolidated') {
        const assignments = template.assignments ?? [];
        const serviceCodes = template.services.map((service) => service.code);
        const assignmentCodes = assignments.map((assignment) => assignment.serviceCode);
        if (assignments.length !== serviceCodes.length || new Set(serviceCodes).size !== serviceCodes.length || new Set(assignmentCodes).size !== assignmentCodes.length || !serviceCodes.every((code) => assignmentCodes.includes(code))) return response.status(400).json({ error: 'Assign an active subform to every selected SERV' });
      }
      response.status(201).json(await store.saveSemiCarePlan(template));
    } catch (error) { next(error); }
  });

  app.get('/api/templates', async (_request, response, next) => {
    try { response.json(await store.listTemplates()); } catch (error) { next(error); }
  });
  app.get('/api/templates/:id', async (request, response, next) => {
    try { response.json(await store.getTemplate(request.params.id)); } catch (error) { next(error); }
  });
  app.post('/api/templates', async (request, response, next) => {
    try {
      const template = request.body as TemplateDocument;
      if (!template.name || !template.schema || !template.uiSchema) return response.status(400).json({ error: 'name, schema and uiSchema are required' });
      response.status(201).json(await store.saveTemplate(template));
    } catch (error) { next(error); }
  });
  app.post('/api/templates/:id/print', async (request, response, next) => {
    try {
      const { formData } = request.body as { formData?: unknown };
      if (formData === undefined) return response.status(400).json({ error: 'formData is required' });
      const template = await store.getTemplate(request.params.id);
      response.type('html').send(renderPrintableHtml(template, formData));
    } catch (error) { next(error); }
  });
  app.get('/api/submissions', async (_request, response, next) => {
    try { response.json(await store.listSubmissions()); } catch (error) { next(error); }
  });
  app.post('/api/submissions', async (request, response, next) => {
    try {
      const { templateId, formData } = request.body as { templateId?: string; formData?: unknown };
      if (!templateId || formData === undefined) return response.status(400).json({ error: 'templateId and formData are required' });
      response.status(201).json(await store.saveSubmission(templateId, formData));
    } catch (error) { next(error); }
  });
  app.get('/api/responses', async (request, response, next) => {
    try {
      const { kind, templateId } = request.query;
      if (kind !== undefined && kind !== 'full-custom' && kind !== 'semi-care-plan') return response.status(400).json({ error: 'Invalid response kind' });
      response.json(await store.listResponses({ kind: kind as string | undefined, templateId: templateId as string | undefined }));
    } catch (error) { next(error); }
  });
  app.post('/api/responses', async (request, response, next) => {
    try {
      const { kind, templateId, formData } = request.body as { kind?: ResponseKind; templateId?: string; formData?: unknown };
      if (!templateId || !kind || formData === undefined) return response.status(400).json({ error: 'kind, templateId and formData are required' });
      if (kind === 'full-custom') {
        if (!isRecord(formData)) return response.status(400).json({ error: 'Invalid full-custom response data' });
        const template = await store.getTemplate(templateId);
        return response.status(201).json(await store.createResponse({ kind, templateId: template.id!, templateName: template.name, templateSnapshot: template, formData: formData as Record<string, unknown> }));
      }
      if (kind === 'semi-care-plan') {
        const template = await store.getSemiCarePlan(templateId);
        if (!isSemiCarePlanResponseData(formData)) return response.status(400).json({ error: 'Invalid semi-care-plan response data' });
        return response.status(201).json(await store.createResponse({ kind, templateId: template.id!, templateName: template.name, templateSnapshot: template, formData }));
      }
      return response.status(400).json({ error: 'Invalid response kind' });
    } catch (error) { next(error); }
  });
  app.get('/api/responses/:id', async (request, response, next) => {
    try { response.json(await store.getResponse(request.params.id)); } catch (error) { next(error); }
  });
  app.patch('/api/responses/:id', async (request, response, next) => {
    try {
      if (Object.keys(request.body).length !== 1 || request.body.formData === undefined) return response.status(400).json({ error: 'formData is required' });
      const existing = await store.getResponse(request.params.id);
      if (existing.kind === 'full-custom' && !isRecord(request.body.formData)) return response.status(400).json({ error: 'Invalid full-custom response data' });
      if (existing.kind === 'semi-care-plan' && !isSemiCarePlanResponseData(request.body.formData)) return response.status(400).json({ error: 'Invalid semi-care-plan response data' });
      response.json(await store.updateResponse(request.params.id, request.body.formData));
    } catch (error) { next(error); }
  });
  app.get('/api/responses/:id/html', async (request, response, next) => {
    try { response.type('html').send(renderResponseHtml(await store.getResponse(request.params.id))); } catch (error) { next(error); }
  });
  app.get('/{*splat}', (_request, response) => {
    response.sendFile(path.join(staticDirectory, 'index.html'));
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    response.status(message.includes('Invalid') || message.includes('Malformed') ? 400 : message.includes('already exists') ? 409 : message.includes('ENOENT') ? 404 : 500).json({ error: message });
  });
  return app;
}
