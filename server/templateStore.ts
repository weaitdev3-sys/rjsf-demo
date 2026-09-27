import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TemplateDocument } from '../src/domain/templateSchema';

export function safeTemplateId(id: string): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error('Invalid template id');
  return id;
}

async function writeJson(directory: string, fileName: string, value: unknown) {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, fileName);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
}

export class TemplateStore {
  private readonly templatesDirectory: string;
  private readonly submissionsDirectory: string;

  constructor(root = '/app/data') {
    this.templatesDirectory = path.resolve(root, 'templates');
    this.submissionsDirectory = path.resolve(root, 'submissions');
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
}
