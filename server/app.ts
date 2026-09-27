import express from 'express';
import { fileURLToPath } from 'node:url';
import type { TemplateDocument } from '../src/domain/templateSchema';
import { TemplateStore } from './templateStore';

export function resolveStaticDirectory(moduleUrl: string): string {
  return fileURLToPath(new URL('../dist', moduleUrl));
}

export function createApp(storageRoot?: string) {
  const app = express();
  const store = new TemplateStore(storageRoot);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(resolveStaticDirectory(import.meta.url)));

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
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    response.status(message.includes('Invalid') || message.includes('Malformed') ? 400 : message.includes('ENOENT') ? 404 : 500).json({ error: message });
  });
  return app;
}
