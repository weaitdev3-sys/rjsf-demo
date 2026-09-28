import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, Paper, Select, Stack, Text, Title } from '@mantine/core';
import type { ResponseKind, SavedResponse } from './domain/response';

const go = (path: string) => { window.location.href = path; };

export function ResponseLibrary() {
  const [responses, setResponses] = useState<SavedResponse[]>([]);
  const [kind, setKind] = useState<ResponseKind | 'all'>((new URLSearchParams(window.location.search).get('kind') as ResponseKind | null) ?? 'all');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => { fetch('/api/responses').then(async (result) => { if (!result.ok) throw new Error('Could not load responses'); return result.json() as Promise<SavedResponse[]>; }).then(setResponses).catch((reason) => setError(reason.message)); }, []);
  const filtered = useMemo(() => responses.filter((response) => (kind === 'all' || response.kind === kind) && (!templateId || response.templateId === templateId)), [responses, kind, templateId]);
  const templates = useMemo(() => [...new Map(responses.filter((response) => kind === 'all' || response.kind === kind).map((response) => [response.templateId, response.templateName])).entries()].map(([value, label]) => ({ value, label })), [responses, kind]);
  return <Stack maw={960} mx="auto" p="xl"><Group justify="space-between"><div><Title order={1}>Saved responses</Title><Text c="dimmed">Find, revise, or view saved full-custom forms and care plans.</Text></div><Button variant="default" onClick={() => go('/')}>Back to workspaces</Button></Group>{error && <Alert color="red">{error}</Alert>}<Group align="end"><Select label="Response type" value={kind} onChange={(value) => { setKind((value ?? 'all') as ResponseKind | 'all'); setTemplateId(null); }} data={[{ value: 'all', label: 'All' }, { value: 'full-custom', label: 'Full-custom' }, { value: 'semi-care-plan', label: 'Care plans' }]} /><Select clearable label="Template" value={templateId} onChange={setTemplateId} data={templates} /></Group>{filtered.map((response) => <Paper key={response.id} p="md" withBorder><Group justify="space-between"><div><Text fw={700}>{response.templateName}</Text><Text size="sm" c="dimmed">{response.kind === 'full-custom' ? 'Full-custom' : 'Care plan'} · Updated {new Date(response.updatedAt).toLocaleString()}</Text></div><Group><Button variant="light" onClick={() => go(response.kind === 'full-custom' ? `/full-custom/response/${response.id}` : `/semi/care-plan/response/${response.id}`)}>Edit response</Button><Button component="a" href={`/api/responses/${response.id}/html`} target="_blank">View HTML</Button></Group></Group></Paper>)}{!filtered.length && <Paper p="xl" withBorder><Text c="dimmed">No saved responses match these filters.</Text></Paper>}</Stack>;
}
