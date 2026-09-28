import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, resolveStaticDirectory } from '../server/app';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('template API', () => {
  it('resolves the production static directory from an ES module URL', () => {
    expect(resolveStaticDirectory('file:///app/server/app.ts')).toBe('/app/dist');
  });

  it('serves the client entry point for an unknown application route', async () => {
    const response = await request(createApp()).get('/templates/new');

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
  });

  it('saves a template and persists a valid response for it', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);

    const saveResponse = await request(app).post('/api/templates').send({
      name: 'Contact form',
      schema: { title: 'Contact form', type: 'object', properties: { name: { type: 'string', title: 'Name' } } },
      uiSchema: {}
    });
    expect(saveResponse.status).toBe(201);
    expect(saveResponse.body.id).toBe('contact-form');

    const submitResponse = await request(app).post('/api/submissions').send({ templateId: 'contact-form', formData: { name: 'Ari' } });
    expect(submitResponse.status).toBe(201);
    expect(submitResponse.body.formData).toEqual({ name: 'Ari' });
  });

  it('renders a saved template and form data as printable HTML', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);

    await request(app).post('/api/templates').send({
      name: 'Contact form',
      fields: [{ id: 'name', kind: 'text', label: 'Name' }],
      schema: { title: 'Contact form', type: 'object', properties: { name: { type: 'string', title: 'Name' } } },
      uiSchema: {}
    });

    const response = await request(app).post('/api/templates/contact-form/print').send({ formData: { name: 'Ari' } });

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('Contact form');
    expect(response.text).toContain('Ari');
  });

  it('requires form data for a print request', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);

    const response = await request(app).post('/api/templates/contact-form/print').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'formData is required' });
  });

  it('returns not found when the printable template does not exist', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);

    const response = await request(app).post('/api/templates/missing/print').send({ formData: {} });

    expect(response.status).toBe(404);
  });
});
