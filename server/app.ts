import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TemplateDocument } from '../src/domain/templateSchema';
import type { SemiCarePlanTemplate, SemiSubformTemplate } from '../src/domain/semiCustom';
import { renderPrintableHtml } from './printRenderer';
import { TemplateStore } from './templateStore';

export function resolveStaticDirectory(moduleUrl: string): string {
  return fileURLToPath(new URL('../dist', moduleUrl));
}

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
  app.post('/api/semi/care-plans', async (request, response, next) => {
    try {
      const template = request.body as SemiCarePlanTemplate;
      if (!template.name || !['per-serv', 'consolidated', 'hybrid'].includes(template.structure) || !Array.isArray(template.services) || (template.assignments ?? []).some((assignment) => !assignment.serviceCode || !assignment.subform?.id || !assignment.subform.configuration)) return response.status(400).json({ error: 'name, structure, services and complete subform snapshots are required' });
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
  app.get('/{*splat}', (_request, response) => {
    response.sendFile(path.join(staticDirectory, 'index.html'));
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    response.status(message.includes('Invalid') || message.includes('Malformed') ? 400 : message.includes('already exists') ? 409 : message.includes('ENOENT') ? 404 : 500).json({ error: message });
  });
  return app;
}
