import { useEffect, useState } from 'react';
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import type { TemplateDocument } from './domain/templateSchema';
import { Shell } from './SemiCustom';

type TemplateSummary = TemplateDocument & { id: string };
const go = (path: string) => { window.location.href = path; };

export function FullCustomLibrary() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  useEffect(() => { fetch('/api/templates').then((response) => response.json() as Promise<TemplateSummary[]>).then(setTemplates); }, []);
  return <Shell title="Full-custom templates"><Group justify="space-between" mb="lg"><Text c="dimmed">Build flexible JSON-schema templates, then fill saved responses.</Text><Button onClick={() => go('/full-custom/new')}>New full-custom template</Button></Group><Stack>{templates.map((template) => <Paper p="md" withBorder key={template.id}><Group justify="space-between"><Text fw={700}>{template.name}</Text><Button onClick={() => go(`/full-custom/template/${template.id}`)}>Open template</Button></Group></Paper>)}{!templates.length && <Paper p="xl" withBorder><Text c="dimmed">No full-custom templates yet.</Text></Paper>}</Stack></Shell>;
}
