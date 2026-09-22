import { useEffect, useMemo, useState } from 'react';
import { Alert, AppShell, Badge, Box, Button, Divider, Group, MantineProvider, NumberInput, Paper, ScrollArea, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import Form from '@rjsf/mantine';
import validator from '@rjsf/validator-ajv8';
import type { EditableField, FieldKind, TemplateDocument } from './domain/templateSchema';
import { buildTemplateDocument } from './domain/templateSchema';

type TemplateSummary = TemplateDocument & { id: string };
const kinds: { kind: FieldKind; label: string }[] = [
  { kind: 'text', label: 'Text field' }, { kind: 'textarea', label: 'Long text' }, { kind: 'number', label: 'Number' },
  { kind: 'email', label: 'Email' }, { kind: 'phone', label: 'Phone' }, { kind: 'date', label: 'Date' },
  { kind: 'select', label: 'Select' }, { kind: 'radio', label: 'Radio' }, { kind: 'checkbox', label: 'Checkbox' }, { kind: 'heading', label: 'Heading' }
];

const emptyField = (kind: FieldKind, index: number): EditableField => ({
  id: `${kind}-${Date.now()}-${index}`,
  kind,
  label: kind === 'heading' ? 'Section heading' : `Untitled ${kinds.find((item) => item.kind === kind)?.label ?? 'field'}`,
  ...(kind === 'select' || kind === 'radio' ? { options: ['Option 1', 'Option 2'] } : {})
});

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Request failed');
  return response.json() as Promise<T>;
}

export default function App() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [name, setName] = useState('Untitled form');
  const [fields, setFields] = useState<EditableField[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'build' | 'fill'>('build');

  const document = useMemo(() => buildTemplateDocument(name, fields), [name, fields]);
  const selected = selectedIndex === null ? undefined : fields[selectedIndex];

  const refresh = async () => {
    try { setTemplates(await api<TemplateSummary[]>('/api/templates')); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load templates'); }
  };
  useEffect(() => { void refresh(); }, []);

  const updateField = (patch: Partial<EditableField>) => {
    if (selectedIndex === null) return;
    setFields((current) => current.map((field, index) => index === selectedIndex ? { ...field, ...patch } : field));
  };
  const addField = (kind: FieldKind) => {
    setFields((current) => [...current, emptyField(kind, current.length)]);
    setSelectedIndex(fields.length);
  };
  const moveField = (direction: -1 | 1) => {
    if (selectedIndex === null) return;
    const next = selectedIndex + direction;
    if (next < 0 || next >= fields.length) return;
    setFields((current) => { const copied = [...current]; [copied[selectedIndex], copied[next]] = [copied[next], copied[selectedIndex]]; return copied; });
    setSelectedIndex(next);
  };
  const removeField = () => {
    if (selectedIndex === null) return;
    setFields((current) => current.filter((_, index) => index !== selectedIndex));
    setSelectedIndex(null);
  };
  const createNew = () => { setOpenedId(null); setName('Untitled form'); setFields([]); setSelectedIndex(null); setMode('build'); setMessage(null); };
  const openTemplate = async (id: string) => {
    try {
      const template = await api<TemplateSummary>(`/api/templates/${id}`);
      setOpenedId(template.id); setName(template.name); setFields(template.fields ?? []); setSelectedIndex(null); setMode('build'); setMessage(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open template'); }
  };
  const save = async () => {
    try {
      const saved = await api<TemplateSummary>('/api/templates', { method: 'POST', body: JSON.stringify({ ...document, id: openedId ?? undefined }) });
      setOpenedId(saved.id); setMessage(`Saved “${saved.name}”`); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save template'); }
  };
  const submit = async ({ formData }: { formData?: unknown }) => {
    if (!openedId) { setMessage('Save this form before collecting responses.'); return; }
    try { await api('/api/submissions', { method: 'POST', body: JSON.stringify({ templateId: openedId, formData: formData ?? {} }) }); setMessage('Response saved locally.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save response'); }
  };

  return <MantineProvider defaultColorScheme="light">
    <AppShell padding={0} navbar={{ width: 280, breakpoint: 'sm' }}>
      <AppShell.Navbar p="md" className="sidebar">
        <Group justify="space-between" mb="xl"><Title order={3}>Form Foundry</Title><Badge color="violet">local</Badge></Group>
        <Button fullWidth onClick={createNew} mb="md">+ New template</Button>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb="xs">Template library</Text>
        <ScrollArea flex={1}>{templates.map((template) => <Button key={template.id} variant={openedId === template.id ? 'light' : 'subtle'} color="dark" justify="start" fullWidth onClick={() => void openTemplate(template.id)}>{template.name}</Button>)}</ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>
        <Box p="lg" className="topbar"><Group justify="space-between"><Box><Text size="sm" c="dimmed">Reusable JSON-schema templates</Text><TextInput value={name} onChange={(event) => setName(event.currentTarget.value)} variant="unstyled" aria-label="Template name" styles={{ input: { fontSize: '1.5rem', fontWeight: 700 } }} /></Box><Group><Button variant={mode === 'build' ? 'filled' : 'light'} onClick={() => setMode('build')}>Build</Button><Button variant={mode === 'fill' ? 'filled' : 'light'} onClick={() => setMode('fill')}>Fill form</Button><Button onClick={() => void save()}>Save template</Button></Group></Group></Box>
        {message && <Alert color="violet" m="lg" withCloseButton onClose={() => setMessage(null)}>{message}</Alert>}
        {mode === 'build' ? <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg" p="lg" className="workspace">
          <Paper p="md" withBorder><Title order={4} mb="sm">Field palette</Title><Stack gap="xs">{kinds.map(({ kind, label }) => <Button key={kind} variant="light" color="violet" onClick={() => addField(kind)} aria-label={`Add ${label.toLowerCase()}`}>+ {label}</Button>)}</Stack></Paper>
          <Paper p="md" withBorder><Group justify="space-between" mb="sm"><Title order={4}>Form canvas</Title><Badge variant="light">{fields.length} blocks</Badge></Group><Stack gap="sm">{fields.length === 0 && <Text c="dimmed" ta="center" py="xl">Choose a field from the palette to begin.</Text>}{fields.map((field, index) => <Paper key={field.id} p="sm" withBorder className={selectedIndex === index ? 'selected-field' : ''} onClick={() => setSelectedIndex(index)} style={{ cursor: 'pointer' }}>{field.kind === 'heading' ? <Title order={4}>{field.label}</Title> : <><Text fw={600}>{field.label}</Text><Text size="xs" c="dimmed">{field.kind}{field.required ? ' · required' : ''}</Text></>}</Paper>)}</Stack></Paper>
          <Paper p="md" withBorder><Title order={4} mb="sm">Field settings</Title>{selected ? <Stack><TextInput label="Field label" value={selected.label} onChange={(event) => updateField({ label: event.currentTarget.value })} /><TextInput label="Help text" value={selected.help ?? ''} onChange={(event) => updateField({ help: event.currentTarget.value })} /><Select label="Type" data={kinds.map((item) => ({ value: item.kind, label: item.label }))} value={selected.kind} onChange={(value) => value && updateField({ kind: value as FieldKind })} />{selected.kind !== 'heading' && <Button variant={selected.required ? 'filled' : 'light'} onClick={() => updateField({ required: !selected.required })}>{selected.required ? 'Required' : 'Optional'}</Button>}{(selected.kind === 'select' || selected.kind === 'radio') && <Textarea label="Options (one per line)" value={(selected.options ?? []).join('\n')} onChange={(event) => updateField({ options: event.currentTarget.value.split('\n').filter(Boolean) })} />}{selected.kind === 'number' && <Group grow><NumberInput label="Minimum" value={selected.minimum ?? ''} onChange={(value) => updateField({ minimum: typeof value === 'number' ? value : undefined })} /><NumberInput label="Maximum" value={selected.maximum ?? ''} onChange={(value) => updateField({ maximum: typeof value === 'number' ? value : undefined })} /></Group>}<Divider /><Group grow><Button variant="light" onClick={() => moveField(-1)}>Move up</Button><Button variant="light" onClick={() => moveField(1)}>Move down</Button></Group><Button color="red" variant="light" onClick={removeField}>Delete field</Button></Stack> : <Text c="dimmed">Select a block to edit it.</Text>}</Paper>
        </SimpleGrid> : <Box maw={760} mx="auto" p="xl"><Paper p="xl" withBorder><Stack gap="lg">{fields.filter((field) => field.kind === 'heading').map((field) => <Title key={field.id} order={3}>{field.label}</Title>)}<Form schema={document.schema} uiSchema={document.uiSchema} validator={validator} onSubmit={submit}><Button type="submit">Save response</Button></Form></Stack></Paper></Box>}
      </AppShell.Main>
    </AppShell>
  </MantineProvider>;
}
