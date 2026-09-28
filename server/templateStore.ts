import { link, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { TemplateDocument } from '../src/domain/templateSchema';
import type { SemiCarePlanTemplate, SemiSubformTemplate } from '../src/domain/semiCustom';
import type { SavedResponse } from '../src/domain/response';

export function safeTemplateId(id: string): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error('Invalid template id');
  return id;
}

export function defaultStorageRoot(workingDirectory = process.cwd()): string {
  return workingDirectory === '/app' ? '/app/data' : workingDirectory;
}

async function writeJson(directory: string, fileName: string, value: unknown) {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, fileName);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
}

async function writeJsonIfAbsent(directory: string, fileName: string, value: unknown): Promise<boolean> {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, fileName);
  const temporary = path.join(directory, `.${fileName}.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    await link(temporary, target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export class TemplateStore {
  private readonly templatesDirectory: string;
  private readonly submissionsDirectory: string;
  private readonly semiSubformsDirectory: string;
  private readonly semiCarePlansDirectory: string;
  private readonly responsesDirectory: string;

  constructor(root = defaultStorageRoot()) {
    this.templatesDirectory = path.resolve(root, 'templates');
    this.submissionsDirectory = path.resolve(root, 'submissions');
    this.semiSubformsDirectory = path.resolve(root, 'semi-subforms');
    this.semiCarePlansDirectory = path.resolve(root, 'semi-care-plans');
    this.responsesDirectory = path.resolve(root, 'responses');
  }

  async listTemplates(): Promise<TemplateDocument[]> {
    await mkdir(this.templatesDirectory, { recursive: true });
    const files = await readdir(this.templatesDirectory);
    const templates = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => {
      const parsed = JSON.parse(await readFile(path.join(this.templatesDirectory, file), 'utf8')) as TemplateDocument;
      if (!parsed.id || !parsed.name || !parsed.schema) throw new Error(`Malformed template: ${file}`);
      return parsed;
    }));
    return templates.sort((left, right) => left.name.localeCompare(right.name));
  }

  async getTemplate(id: string): Promise<TemplateDocument> {
    const safeId = safeTemplateId(id);
    const parsed = JSON.parse(await readFile(path.join(this.templatesDirectory, `${safeId}.json`), 'utf8')) as TemplateDocument;
    if (parsed.id !== safeId || !parsed.schema) throw new Error('Malformed template');
    return parsed;
  }

  async saveTemplate(template: TemplateDocument): Promise<TemplateDocument> {
    const id = safeTemplateId(template.id ?? template.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    const now = new Date().toISOString();
    const saved = { ...template, id, createdAt: template.createdAt ?? now, updatedAt: now };
    await writeJson(this.templatesDirectory, `${id}.json`, saved);
    return saved;
  }

  async saveSubmission(templateId: string, formData: unknown) {
    const safeId = safeTemplateId(templateId);
    const submission = { templateId: safeId, submittedAt: new Date().toISOString(), formData };
    await writeJson(this.submissionsDirectory, `${safeId}-${Date.now()}.json`, submission);
    return submission;
  }

  async listSubmissions() {
    await mkdir(this.submissionsDirectory, { recursive: true });
    const files = await readdir(this.submissionsDirectory);
    return Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) =>
      JSON.parse(await readFile(path.join(this.submissionsDirectory, file), 'utf8'))
    ));
  }

  async listSemiSubforms(activeOnly = false): Promise<SemiSubformTemplate[]> {
    await mkdir(this.semiSubformsDirectory, { recursive: true });
    const files = await readdir(this.semiSubformsDirectory);
    const templates = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => JSON.parse(await readFile(path.join(this.semiSubformsDirectory, file), 'utf8')) as SemiSubformTemplate));
    return templates.filter((template) => template.id && template.name && typeof template.active === 'boolean' && template.configuration && (!activeOnly || template.active)).sort((left, right) => left.name.localeCompare(right.name));
  }

  async saveSemiSubform(template: SemiSubformTemplate): Promise<SemiSubformTemplate> {
    const id = safeTemplateId(template.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    const now = new Date().toISOString();
    const saved = { ...template, id, createdAt: template.createdAt ?? now, updatedAt: now };
    if (!await writeJsonIfAbsent(this.semiSubformsDirectory, `${id}.json`, saved)) throw new Error('A subform template with this name already exists');
    return saved;
  }

  async updateSemiSubformActive(id: string, active: boolean): Promise<SemiSubformTemplate> {
    const safeId = safeTemplateId(id);
    const target = path.join(this.semiSubformsDirectory, `${safeId}.json`);
    const existing = JSON.parse(await readFile(target, 'utf8')) as SemiSubformTemplate;
    const saved = { ...existing, id: safeId, active, updatedAt: new Date().toISOString() };
    await writeJson(this.semiSubformsDirectory, `${safeId}.json`, saved);
    return saved;
  }

  async listSemiCarePlans(): Promise<SemiCarePlanTemplate[]> {
    await mkdir(this.semiCarePlansDirectory, { recursive: true });
    const files = await readdir(this.semiCarePlansDirectory);
    const templates = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => JSON.parse(await readFile(path.join(this.semiCarePlansDirectory, file), 'utf8') as string) as SemiCarePlanTemplate));
    return templates.filter((template) => template.id && template.name && template.structure && Array.isArray(template.services)).sort((left, right) => left.name.localeCompare(right.name));
  }

  async getSemiCarePlan(id: string): Promise<SemiCarePlanTemplate> {
    const safeId = safeTemplateId(id);
    const parsed = JSON.parse(await readFile(path.join(this.semiCarePlansDirectory, `${safeId}.json`), 'utf8')) as SemiCarePlanTemplate;
    if (parsed.id !== safeId || !parsed.name || !parsed.structure || !Array.isArray(parsed.services)) throw new Error('Malformed semi-custom care plan');
    return parsed;
  }

  async saveSemiCarePlan(template: SemiCarePlanTemplate): Promise<SemiCarePlanTemplate> {
    const id = safeTemplateId(template.id ?? template.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    const now = new Date().toISOString();
    const saved = { ...template, id, createdAt: template.createdAt ?? now, updatedAt: now };
    await writeJson(this.semiCarePlansDirectory, `${id}.json`, saved);
    return saved;
  }

  async createResponse(response: Omit<SavedResponse, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedResponse> {
    const now = new Date().toISOString();
    const saved = { ...response, id: randomUUID(), createdAt: now, updatedAt: now } as SavedResponse;
    await writeJson(this.responsesDirectory, `${saved.id}.json`, saved);
    return saved;
  }

  async getResponse(id: string): Promise<SavedResponse> {
    const safeId = safeTemplateId(id);
    const parsed = JSON.parse(await readFile(path.join(this.responsesDirectory, `${safeId}.json`), 'utf8')) as SavedResponse;
    if (!parsed.id || parsed.id !== safeId || !parsed.kind || !parsed.templateSnapshot) throw new Error('Malformed response');
    return parsed;
  }

  async listResponses(filters: { kind?: string; templateId?: string } = {}): Promise<SavedResponse[]> {
    await mkdir(this.responsesDirectory, { recursive: true });
    const files = await readdir(this.responsesDirectory);
    const responses = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => JSON.parse(await readFile(path.join(this.responsesDirectory, file), 'utf8')) as SavedResponse));
    return responses.filter((response) => (!filters.kind || response.kind === filters.kind) && (!filters.templateId || response.templateId === filters.templateId)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async updateResponse(id: string, formData: unknown): Promise<SavedResponse> {
    const existing = await this.getResponse(id);
    const saved = { ...existing, formData, updatedAt: new Date().toISOString() } as SavedResponse;
    await writeJson(this.responsesDirectory, `${existing.id}.json`, saved);
    return saved;
  }
}
