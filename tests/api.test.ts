import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, resolveStaticDirectory } from '../server/app';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('template API', () => {
  it('creates, lists, and updates stable saved full-custom responses', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);
    const template = await request(app).post('/api/templates').send({ name: 'Response form', schema: { title: 'Response form', type: 'object', properties: {} }, uiSchema: {} });

    const created = await request(app).post('/api/responses').send({ kind: 'full-custom', templateId: template.body.id, formData: { name: 'Ari' } });
    const updated = await request(app).patch(`/api/responses/${created.body.id}`).send({ formData: { name: 'Bea' } });
    const listed = await request(app).get('/api/responses?kind=full-custom&templateId=response-form');

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: 'full-custom', templateId: 'response-form', templateName: 'Response form', formData: { name: 'Ari' } });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id: created.body.id, createdAt: created.body.createdAt, formData: { name: 'Bea' } });
    expect(listed.body).toEqual([expect.objectContaining({ id: created.body.id })]);
  });
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

  it('stores semi-custom subforms separately and lists only active templates for composition', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);

    const active = await request(app).post('/api/semi/subforms').send({ name: 'Personal care', active: true, configuration: { careNeeds: true } });
    await request(app).post('/api/semi/subforms').send({ name: 'Archived care', active: false, configuration: { remarks: true } });
    const response = await request(app).get('/api/semi/subforms?active=true');

    expect(active.status).toBe(201);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: 'personal-care', name: 'Personal care', active: true });
  });

  it('rejects a duplicate semi-custom subform name without replacing the existing library entry', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);

    await request(app).post('/api/semi/subforms').send({ id: 'first-item-list', name: 'Item List', active: true, configuration: { itemList: { columns: ['Description'] } } });
    const duplicate = await request(app).post('/api/semi/subforms').send({ id: 'second-item-list', name: 'item-list', active: false, configuration: { sections: { remarks: true } } });
    const library = await request(app).get('/api/semi/subforms');

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: 'A subform template with this name already exists' });
    expect(library.body).toEqual([expect.objectContaining({ id: 'item-list', active: true, configuration: { itemList: { columns: ['Description'] } } })]);
  });

  it('allows only one concurrent semi-custom subform create for a normalized name', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);

    const [first, second] = await Promise.all([
      request(app).post('/api/semi/subforms').send({ name: 'Nursing', active: true, configuration: { sections: { careNeeds: true } } }),
      request(app).post('/api/semi/subforms').send({ name: 'nursing', active: false, configuration: { sections: { remarks: true } } }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect((await request(app).get('/api/semi/subforms')).body).toHaveLength(1);
  });

  it('updates an existing semi-custom subform active state by ID', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);

    const created = await request(app).post('/api/semi/subforms').send({ name: 'Personal care', active: true, configuration: { sections: { careNeeds: true } } });
    const updated = await request(app).patch(`/api/semi/subforms/${created.body.id}`).send({ active: false });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id: 'personal-care', active: false, configuration: { sections: { careNeeds: true } } });
  });

  it('saves a self-contained semi-custom care plan with subform snapshots', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);
    const subform = (await request(app).post('/api/semi/subforms').send({ name: 'Personal care', active: true, configuration: { schedule: { timeFormat: 'start-end' } } })).body;

    const response = await request(app).post('/api/semi/care-plans').send({
      name: 'Home support plan',
      structure: 'per-serv',
      services: [{ code: 'PC-01', name: 'Showering & Grooming Assistance', category: 'Personal Care' }],
      assignments: [{ serviceCode: 'PC-01', subform: { id: subform.id, name: subform.name, configuration: subform.configuration } }]
    });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('home-support-plan');
    expect(response.body.assignments[0].subform).toEqual({ id: subform.id, name: 'Personal care', configuration: { schedule: { timeFormat: 'start-end' } } });
  });

  it('requires a subform assignment for every selected Per-SERV service', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);

    const response = await request(app).post('/api/semi/care-plans').send({
      name: 'Incomplete home support plan',
      structure: 'per-serv',
      services: [{ code: 'PC-01', name: 'Showering & Grooming Assistance', category: 'Personal Care' }],
      assignments: [],
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Assign an active subform to every selected SERV' });
  });

  it('renders saved semi-custom care plans as HTML and returns not found for an unknown plan', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);
    const saved = await request(app).post('/api/semi/care-plans').send({
      name: 'HTML care plan',
      structure: 'consolidated',
      services: [{ code: 'DOM-01', name: 'General Household Cleaning', category: 'Domestic Assistance' }],
      participantFields: ['Full Legal Name & Preferred Name'],
      servInfo: { careNeeds: true },
    });

    const html = await request(app).get(`/api/semi/care-plans/${saved.body.id}/html`);
    const missing = await request(app).get('/api/semi/care-plans/missing/html');

    expect(html.status).toBe(200);
    expect(html.type).toBe('text/html');
    expect(html.text).toContain('<title>HTML care plan</title>');
    expect(missing.status).toBe(404);
  });

  it('rejects malformed semi-custom plans that cannot be rendered as HTML', async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'form-builder-'));
    temporaryDirectories.push(storageRoot);
    const app = createApp(storageRoot);

    const invalidService = await request(app).post('/api/semi/care-plans').send({ name: 'Broken plan', structure: 'consolidated', services: [null] });
    const invalidGeneralInfo = await request(app).post('/api/semi/care-plans').send({ name: 'Broken fields', structure: 'consolidated', services: [], generalInfo: { health: null } });

    expect(invalidService.status).toBe(400);
    expect(invalidGeneralInfo.status).toBe(400);
    expect(invalidService.body).toEqual({ error: 'Invalid semi-custom care plan' });
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
