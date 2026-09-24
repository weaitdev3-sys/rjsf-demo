import { useEffect, useMemo, useState } from 'react';
import { Alert, AppShell, Badge, Box, Button, Checkbox, Divider, Group, MantineProvider, NumberInput, Paper, ScrollArea, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import Form from '@rjsf/mantine';
import validator from '@rjsf/validator-ajv8';
import type { EditableField, FieldKind, TemplateDocument, VisibilityOperator, VisibilityRule } from './domain/templateSchema';
import { buildFieldKeyMap, buildTemplateDocument, clearVisibilityReferences, evaluateVisibleFields, pruneHiddenValues, propertyName } from './domain/templateSchema';

type TemplateSummary = TemplateDocument & { id: string };
const fieldKinds: { kind: FieldKind; label: string }[] = [
  { kind: 'text', label: 'Text field' }, { kind: 'textarea', label: 'Long text' }, { kind: 'number', label: 'Number' }, { kind: 'email', label: 'Email' }, { kind: 'phone', label: 'Phone' }, { kind: 'date', label: 'Date picker' }, { kind: 'time', label: 'Time picker' }, { kind: 'select', label: 'Select' }, { kind: 'radio', label: 'Radio' }, { kind: 'checkbox', label: 'Checkbox' }, { kind: 'autocomplete', label: 'Autocomplete' }, { kind: 'list', label: 'List input' }, { kind: 'container', label: 'Container' }, { kind: 'heading', label: 'Heading' }, { kind: 'textLayout', label: 'Text' }, { kind: 'twoColumn', label: 'Two-column' }
];
const inputKinds = fieldKinds.filter(({ kind }) => !['container', 'heading', 'textLayout', 'twoColumn'].includes(kind));
const listChildKinds = inputKinds.filter(({ kind }) => kind !== 'list');
const containerChildKinds = listChildKinds;
const layoutKinds = fieldKinds.filter(({ kind }) => ['container', 'heading', 'textLayout', 'twoColumn'].includes(kind));
const kindLabel = (kind: FieldKind) => fieldKinds.find((item) => item.kind === kind)?.label ?? 'field';
const keyedField = (field: EditableField) => !['heading', 'textLayout', 'twoColumn'].includes(field.kind);
const uniqueLabel = (label: string, siblings: EditableField[], id?: string) => {
  const keys = new Set(siblings.filter((field) => field.id !== id && keyedField(field)).map((field) => propertyName(field.label)));
  if (!keys.has(propertyName(label))) return label;
  let suffix = 2;
  while (keys.has(propertyName(`${label}_${suffix}`))) suffix += 1;
  return `${label}_${suffix}`;
};
const emptyField = (kind: FieldKind, index: number): EditableField => ({
  id: `${kind}-${Date.now()}-${index}`,
  kind,
  label: kind === 'heading' ? 'Section heading' : `Untitled ${kindLabel(kind)}`,
  ...(kind === 'select' || kind === 'radio' || kind === 'autocomplete' ? { options: ['Option 1', 'Option 2'] } : {}),
  ...(kind === 'list' ? { children: [emptyField('text', 0)] } : {}),
  ...(kind === 'container' ? { children: [], showLabel: true } : {}),
  ...(kind === 'textLayout' ? { content: 'Text block' } : {}),
  ...(kind === 'twoColumn' ? { leftChildren: [], rightChildren: [] } : {})
});

const visibilityControllerKinds: FieldKind[] = ['text', 'textarea', 'number', 'email', 'phone', 'date', 'time', 'select', 'radio', 'checkbox', 'autocomplete'];
const visibilityOperators = (kind: FieldKind): { value: VisibilityOperator; label: string }[] => {
  if (kind === 'checkbox') return [{ value: 'isChecked', label: 'Is checked' }, { value: 'isUnchecked', label: 'Is unchecked' }];
  const base: { value: VisibilityOperator; label: string }[] = [{ value: 'equals', label: 'Equals' }, { value: 'notEquals', label: 'Does not equal' }, { value: 'isBlank', label: 'Is blank' }, { value: 'isNotBlank', label: 'Is not blank' }];
  return kind === 'number' || kind === 'date' || kind === 'time' ? [...base, { value: 'greaterThan', label: 'Is greater than' }, { value: 'lessThan', label: 'Is less than' }] : base;
};
const controllerFields = (fields: EditableField[], listItem = false): EditableField[] => fields.flatMap((field) => {
  if (field.kind === 'list') return controllerFields(field.children ?? [], true);
  if (field.kind === 'container') return [...(listItem ? [] : []), ...controllerFields(field.children ?? [], listItem)];
  if (field.kind === 'twoColumn') return [...controllerFields(field.leftChildren ?? [], listItem), ...controllerFields(field.rightChildren ?? [], listItem)];
  return !listItem && visibilityControllerKinds.includes(field.kind) ? [field] : [];
});
const allFields = (fields: EditableField[]): EditableField[] => fields.flatMap((field) => [field, ...allFields(field.children ?? []), ...allFields(field.leftChildren ?? []), ...allFields(field.rightChildren ?? [])]);
const createsVisibilityCycle = (fields: EditableField[], targetId: string, controllerId: string) => {
  const dependencies = new Map<string, Set<string>>();
  const addDependency = (fieldId: string, dependencyId: string | undefined) => {
    if (!dependencyId) return;
    const fieldDependencies = dependencies.get(fieldId) ?? new Set<string>();
    fieldDependencies.add(dependencyId);
    dependencies.set(fieldId, fieldDependencies);
  };
  const visit = (items: EditableField[], parentId?: string) => items.forEach((field) => {
    addDependency(field.id, parentId);
    if (field.visibility && field.id !== targetId) addDependency(field.id, field.visibility.controllerId);
    visit(field.children ?? [], field.id);
    visit(field.leftChildren ?? [], field.id);
    visit(field.rightChildren ?? [], field.id);
  });
  visit(fields);
  addDependency(targetId, controllerId);
  const reachesTarget = (id: string, seen = new Set<string>()): boolean => {
    if (id === targetId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return [...(dependencies.get(id) ?? [])].some((dependency) => reachesTarget(dependency, seen));
  };
  return reachesTarget(controllerId);
};

function VisibilitySettings({ fields, field, onChange }: { fields: EditableField[]; field: EditableField; onChange: (rule: VisibilityRule | undefined) => void }) {
  const controllers = controllerFields(fields).filter((candidate) => candidate.id !== field.id && !createsVisibilityCycle(fields, field.id, candidate.id));
  const controller = controllers.find((candidate) => candidate.id === field.visibility?.controllerId);
  const operators = controller ? visibilityOperators(controller.kind) : [];
  const rule = field.visibility;
  const setController = (controllerId: string | null) => {
    const nextController = controllers.find((candidate) => candidate.id === controllerId);
    if (!nextController) return;
    const operator = visibilityOperators(nextController.kind)[0].value;
    onChange({ controllerId: nextController.id, operator, ...(operator === 'isChecked' || operator === 'isUnchecked' ? {} : { value: nextController.options?.[0] ?? '' }) });
  };
  const needsValue = rule && !['isBlank', 'isNotBlank', 'isChecked', 'isUnchecked'].includes(rule.operator);
  return <><Divider /><Title order={5}>Visibility</Title><Select label="Visibility" data={[{ value: 'always', label: 'Always show' }, ...(controllers.length ? [{ value: 'conditional', label: 'Show when…' }] : [])]} value={rule ? 'conditional' : 'always'} onChange={(value) => value === 'conditional' ? setController(controllers[0]?.id ?? null) : onChange(undefined)} />{rule && controller && <><Select label="Show when field" data={controllers.map((candidate) => ({ value: candidate.id, label: candidate.label }))} value={rule.controllerId} onChange={setController} /><Select label="Operator" data={operators} value={rule.operator} onChange={(operator) => operator && onChange({ ...rule, operator: operator as VisibilityOperator, ...(['isBlank', 'isNotBlank', 'isChecked', 'isUnchecked'].includes(operator) ? { value: undefined } : {}) })} />{needsValue && (controller.options?.length ? <Select label="Comparison value" data={controller.options} value={String(rule.value ?? '')} onChange={(value) => onChange({ ...rule, value: value ?? '' })} /> : controller.kind === 'number' ? <NumberInput label="Comparison value" value={typeof rule.value === 'number' ? rule.value : ''} onChange={(value) => onChange({ ...rule, value: typeof value === 'number' ? value : 0 })} /> : <TextInput label="Comparison value" type={controller.kind === 'date' || controller.kind === 'time' ? controller.kind : 'text'} value={String(rule.value ?? '')} onChange={(event) => onChange({ ...rule, value: event.currentTarget.value })} />)}</>}</>;
}

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
  const [selectedChildIndex, setSelectedChildIndex] = useState<number | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'build' | 'fill'>('build');
  const [fillData, setFillData] = useState<Record<string, unknown>>({});

  const buildResult = useMemo(() => {
    try { return { document: buildTemplateDocument(name, fields), error: null }; }
    catch (error) { return { document: undefined, error: error instanceof Error ? error.message : 'Invalid form definition' }; }
  }, [name, fields]);
  const fillResult = useMemo(() => {
    try {
      const visibleFields = evaluateVisibleFields(fields, fillData);
      return { document: buildTemplateDocument(name, visibleFields, buildFieldKeyMap(fields)), fields: visibleFields, error: null };
    } catch (error) { return { document: undefined, fields: [], error: error instanceof Error ? error.message : 'Invalid visibility rule' }; }
  }, [name, fields, fillData]);
  const selected = selectedIndex === null ? undefined : fields[selectedIndex];
  const selectedChild = (selected?.kind === 'list' || selected?.kind === 'container') && selectedChildIndex !== null ? selected.children?.[selectedChildIndex] : undefined;
  const editingChild = Boolean(selectedChild);
  const editable = selectedChild ?? selected;

  const refresh = async () => { try { setTemplates(await api<TemplateSummary[]>('/api/templates')); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load templates'); } };
  useEffect(() => { void refresh(); }, []);
  const updateField = (patch: Partial<EditableField>) => {
    if (selectedIndex === null) return;
    setFields((current) => current.map((field, index) => {
      if (index !== selectedIndex) return field;
      if ((field.kind !== 'list' && field.kind !== 'container') || selectedChildIndex === null) return { ...field, ...patch, ...(patch.label === undefined ? {} : { label: uniqueLabel(patch.label, current, field.id) }) };
      return { ...field, children: field.children?.map((child, childIndex) => childIndex === selectedChildIndex ? { ...child, ...patch, ...(patch.label === undefined ? {} : { label: uniqueLabel(patch.label, field.children ?? [], child.id) }) } : child) };
    }));
  };
  const addField = (kind: FieldKind) => { setFields((current) => { const field = emptyField(kind, current.length); return [...current, { ...field, label: uniqueLabel(field.label, current) }]; }); setSelectedIndex(fields.length); setSelectedChildIndex(null); };
  const addChild = (kind: FieldKind) => {
    if (selectedIndex === null || (selected?.kind !== 'list' && selected?.kind !== 'container')) return;
    const childCount = selected.children?.length ?? 0;
    setFields((current) => current.map((field, index) => {
      if (index !== selectedIndex) return field;
      const child = emptyField(kind, childCount);
      return { ...field, children: [...(field.children ?? []), { ...child, label: uniqueLabel(child.label, field.children ?? []) }] };
    }));
    setSelectedChildIndex(childCount);
  };
  const addColumnChild = (side: 'leftChildren' | 'rightChildren', kind: FieldKind) => {
    if (selectedIndex === null || selected?.kind !== 'twoColumn') return;
    setFields((current) => current.map((field, index) => {
      if (index !== selectedIndex) return field;
      const child = emptyField(kind, field[side]?.length ?? 0);
      const siblings = [...(field.leftChildren ?? []), ...(field.rightChildren ?? [])];
      return { ...field, [side]: [...(field[side] ?? []), { ...child, label: uniqueLabel(child.label, siblings) }] };
    }));
  };
  const moveTopLevelField = (direction: -1 | 1) => {
    if (selectedIndex === null) return;
    const next = selectedIndex + direction;
    if (next < 0 || next >= fields.length) return;
    setFields((current) => { const copied = [...current]; [copied[selectedIndex], copied[next]] = [copied[next], copied[selectedIndex]]; return copied; }); setSelectedIndex(next);
  };
  const moveChildField = (direction: -1 | 1) => {
    if (selectedIndex === null || selectedChildIndex === null || (selected?.kind !== 'list' && selected?.kind !== 'container')) return;
    const next = selectedChildIndex + direction;
    if (next < 0 || next >= (selected.children?.length ?? 0)) return;
    setFields((current) => current.map((field, index) => {
      if (index !== selectedIndex) return field;
      const children = [...(field.children ?? [])]; [children[selectedChildIndex], children[next]] = [children[next], children[selectedChildIndex]];
      return { ...field, children };
    })); setSelectedChildIndex(next);
  };
  const removeSelected = () => {
    if (selectedIndex === null) return;
    if (selectedChildIndex !== null && (selected?.kind === 'list' || selected?.kind === 'container')) {
      const removedId = selected.children?.[selectedChildIndex]?.id;
      setFields((current) => clearVisibilityReferences(current.map((field, index) => index === selectedIndex ? { ...field, children: field.children?.filter((_, childIndex) => childIndex !== selectedChildIndex) } : field), removedId ? allFields([selected.children?.[selectedChildIndex]!]).map((field) => field.id) : [])); setSelectedChildIndex(null); return;
    }
    const removedIds = selected ? allFields([selected]).map((field) => field.id) : [];
    setFields((current) => clearVisibilityReferences(current.filter((_, index) => index !== selectedIndex), removedIds)); setSelectedIndex(null); setSelectedChildIndex(null);
  };
  const createNew = () => { setOpenedId(null); setName('Untitled form'); setFields([]); setSelectedIndex(null); setSelectedChildIndex(null); setFillData({}); setMode('build'); setMessage(null); };
  const openTemplate = async (id: string) => {
    try { const template = await api<TemplateSummary>(`/api/templates/${id}`); setOpenedId(template.id); setName(template.name); setFields(template.fields ?? []); setSelectedIndex(null); setSelectedChildIndex(null); setFillData({}); setMode('build'); setMessage(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open template'); }
  };
  const save = async () => {
    if (!buildResult.document) { setMessage(buildResult.error ?? 'Fix the form definition before saving.'); return; }
    try { const saved = await api<TemplateSummary>('/api/templates', { method: 'POST', body: JSON.stringify({ ...buildResult.document, id: openedId ?? undefined }) }); setOpenedId(saved.id); setMessage(`Saved “${saved.name}”`); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save template'); }
  };
  const submit = async ({ formData }: { formData?: unknown }) => {
    if (!openedId) { setMessage('Save this form before collecting responses.'); return; }
    try { await api('/api/submissions', { method: 'POST', body: JSON.stringify({ templateId: openedId, formData: pruneHiddenValues(fields, formData ?? fillData) }) }); setMessage('Response saved locally.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save response'); }
  };
  const editorKinds = editingChild ? (selected?.kind === 'container' ? containerChildKinds : listChildKinds) : fieldKinds;

  return <MantineProvider defaultColorScheme="light"><AppShell padding={0} navbar={{ width: 280, breakpoint: 'sm' }}>
    <AppShell.Navbar p="md" className="sidebar"><Group justify="space-between" mb="xl"><Title order={3}>Form Foundry</Title><Badge color="violet">local</Badge></Group><Button fullWidth onClick={createNew} mb="md">+ New template</Button><Text size="xs" fw={700} c="dimmed" tt="uppercase" mb="xs">Template library</Text><ScrollArea flex={1}>{templates.map((template) => <Button key={template.id} variant={openedId === template.id ? 'light' : 'subtle'} color="dark" justify="start" fullWidth onClick={() => void openTemplate(template.id)}>{template.name}</Button>)}</ScrollArea></AppShell.Navbar>
    <AppShell.Main><Box p="lg" className="topbar"><Group justify="space-between"><Box><Text size="sm" c="dimmed">Reusable JSON-schema templates</Text><TextInput value={name} onChange={(event) => setName(event.currentTarget.value)} variant="unstyled" aria-label="Template name" styles={{ input: { fontSize: '1.5rem', fontWeight: 700 } }} /></Box><Group><Button variant={mode === 'build' ? 'filled' : 'light'} onClick={() => setMode('build')}>Build</Button><Button variant={mode === 'fill' ? 'filled' : 'light'} onClick={() => setMode('fill')}>Fill form</Button><Button onClick={() => void save()}>Save template</Button></Group></Group></Box>
      {(message || buildResult.error) && <Alert color={buildResult.error ? 'red' : 'violet'} m="lg" withCloseButton={!buildResult.error} onClose={() => setMessage(null)}>{buildResult.error ?? message}</Alert>}
      {mode === 'build' ? <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg" p="lg" className="workspace">
        <Paper p="md" withBorder><Title order={4} mb="sm">Fields</Title><Stack gap="xs">{inputKinds.map(({ kind, label }) => <Button key={kind} variant="light" color="violet" onClick={() => addField(kind)} aria-label={`Add ${label.toLowerCase()}`}>+ {label}</Button>)}</Stack><Divider my="md" /><Title order={4} mb="sm">Layout</Title><Stack gap="xs">{layoutKinds.map(({ kind, label }) => <Button key={kind} variant="light" color="violet" onClick={() => addField(kind)} aria-label={`Add ${label.toLowerCase()}`}>+ {label}</Button>)}</Stack></Paper>
        <Paper p="md" withBorder><Group justify="space-between" mb="sm"><Title order={4}>Form canvas</Title><Badge variant="light">{fields.length} blocks</Badge></Group><Stack gap="sm">{fields.length === 0 && <Text c="dimmed" ta="center" py="xl">Choose a field from the palette to begin.</Text>}{fields.map((field, index) => <Paper key={field.id} p="sm" withBorder className={selectedIndex === index ? 'selected-field' : ''} onClick={() => { setSelectedIndex(index); setSelectedChildIndex(null); }} style={{ cursor: 'pointer' }}>{field.kind === 'heading' ? <Title order={4}>{field.label}</Title> : field.kind === 'textLayout' ? <Text>{field.content}</Text> : field.kind === 'twoColumn' ? <><Text fw={600}>{field.label}</Text><div className="two-column-layout">{(['leftChildren', 'rightChildren'] as const).map((side) => <Stack key={side} gap={4}><Text size="xs" c="dimmed">{side === 'leftChildren' ? 'Left column' : 'Right column'}</Text>{field[side]?.map((child) => <Paper key={child.id} p={6} withBorder><Text size="sm">{child.label}</Text></Paper>)}</Stack>)}</div></> : <><Text fw={600}>{field.label}</Text><Text size="xs" c="dimmed">{field.kind}{field.required ? ' · required' : ''}{field.kind === 'list' ? ` · ${field.children?.length ?? 0} item fields` : ''}{field.kind === 'container' ? ` · ${field.children?.length ?? 0} fields` : ''}</Text>{(field.kind === 'list' || field.kind === 'container') && <Stack gap={4} mt="xs" className={field.kind === 'container' ? 'container-children' : undefined}>{field.children?.map((child, childIndex) => <Paper key={child.id} p={6} withBorder onClick={(event) => { event.stopPropagation(); setSelectedIndex(index); setSelectedChildIndex(childIndex); }} className={selectedChildIndex === childIndex && selectedIndex === index ? 'selected-child' : ''}><Text size="sm">{child.label}</Text><Text size="xs" c="dimmed">{child.kind}</Text></Paper>)}</Stack>}</>}</Paper>)}</Stack></Paper>
        <Paper p="md" withBorder><Title order={4} mb="sm">Field settings</Title>{selected?.kind === 'twoColumn' ? <Stack><TextInput label="Field label" value={selected.label} onChange={(event) => updateField({ label: event.currentTarget.value })} /><VisibilitySettings fields={fields} field={selected} onChange={(visibility) => updateField({ visibility })} /><Divider /><Title order={5}>Left column</Title><Group gap="xs">{containerChildKinds.map(({ kind, label }) => <Button key={kind} size="xs" variant="light" onClick={() => addColumnChild('leftChildren', kind)} aria-label={`Add ${label.toLowerCase()} to left column`}>+ {label}</Button>)}</Group><Title order={5}>Right column</Title><Group gap="xs">{containerChildKinds.map(({ kind, label }) => <Button key={kind} size="xs" variant="light" onClick={() => addColumnChild('rightChildren', kind)} aria-label={`Add ${label.toLowerCase()} to right column`}>+ {label}</Button>)}</Group><Button color="red" variant="light" onClick={removeSelected}>Delete two-column layout</Button></Stack> : selected?.kind === 'textLayout' ? <Stack><Textarea label="Text content" value={selected.content ?? ''} onChange={(event) => updateField({ content: event.currentTarget.value })} /><VisibilitySettings fields={fields} field={selected} onChange={(visibility) => updateField({ visibility })} /><Button color="red" variant="light" onClick={removeSelected}>Delete text</Button></Stack> : (selected?.kind === 'list' || selected?.kind === 'container') && !editingChild ? <Stack><TextInput label="Field label" value={selected.label} onChange={(event) => updateField({ label: event.currentTarget.value })} /><TextInput label="Help text" value={selected.help ?? ''} onChange={(event) => updateField({ help: event.currentTarget.value })} />{selected.kind === 'container' && <Checkbox label="Show label" checked={selected.showLabel !== false} onChange={(event) => updateField({ showLabel: event.currentTarget.checked })} />}{selected.kind === 'list' && <Button variant={selected.required ? 'filled' : 'light'} onClick={() => updateField({ required: !selected.required })}>{selected.required ? 'Required' : 'Optional'}</Button>}<VisibilitySettings fields={fields} field={selected} onChange={(visibility) => updateField({ visibility })} /><Divider /><Title order={5}>{selected.kind === 'container' ? 'Container fields' : 'Item fields'}</Title><Group gap="xs">{(selected.kind === 'container' ? containerChildKinds : listChildKinds).map(({ kind, label }) => <Button key={kind} size="xs" variant="light" onClick={() => addChild(kind)} aria-label={`Add ${label.toLowerCase()} field`}>+ {label}</Button>)}</Group><Text size="sm" c="dimmed">Select a child field in the canvas to configure it.</Text><Button color="red" variant="light" onClick={removeSelected}>{selected.kind === 'container' ? 'Delete container' : 'Delete list'}</Button></Stack> : editable ? <Stack>{editingChild && <Button variant="subtle" size="xs" onClick={() => setSelectedChildIndex(null)}>← Back to {selected?.kind === 'container' ? 'container' : 'list'}</Button>}<TextInput label="Field label" value={editable.label} onChange={(event) => updateField({ label: event.currentTarget.value })} /><TextInput label="Help text" value={editable.help ?? ''} onChange={(event) => updateField({ help: event.currentTarget.value })} /><Select label="Type" data={editorKinds.map((item) => ({ value: item.kind, label: item.label }))} value={editable.kind} onChange={(value) => value && updateField({ kind: value as FieldKind })} />{editable.kind !== 'heading' && <Button variant={editable.required ? 'filled' : 'light'} onClick={() => updateField({ required: !editable.required })}>{editable.required ? 'Required' : 'Optional'}</Button>}{(editable.kind === 'select' || editable.kind === 'radio' || editable.kind === 'autocomplete') && <Textarea label="Options (one per line)" value={(editable.options ?? []).join('\n')} onChange={(event) => updateField({ options: event.currentTarget.value.split('\n').filter(Boolean) })} />}{editable.kind === 'number' && <Group grow><NumberInput label="Minimum" value={editable.minimum ?? ''} onChange={(value) => updateField({ minimum: typeof value === 'number' ? value : undefined })} /><NumberInput label="Maximum" value={editable.maximum ?? ''} onChange={(value) => updateField({ maximum: typeof value === 'number' ? value : undefined })} /></Group>}{(!editingChild || selected?.kind === 'container') && <VisibilitySettings fields={fields} field={editable} onChange={(visibility) => updateField({ visibility })} />}<Divider /><Group grow><Button variant="light" onClick={() => editingChild ? moveChildField(-1) : moveTopLevelField(-1)}>Move up</Button><Button variant="light" onClick={() => editingChild ? moveChildField(1) : moveTopLevelField(1)}>Move down</Button></Group><Button color="red" variant="light" onClick={removeSelected}>Delete field</Button></Stack> : <Text c="dimmed">Select a block to edit it.</Text>}</Paper>
      </SimpleGrid> : <Box maw={760} mx="auto" p="xl"><Paper p="xl" withBorder>{fillResult.document ? <Stack gap="lg">{fillResult.fields.filter((field) => field.kind === 'heading').map((field) => <Title key={field.id} order={3}>{field.label}</Title>)}{fillResult.fields.filter((field) => field.kind === 'textLayout').map((field) => <Text key={field.id}>{field.content}</Text>)}<Form schema={fillResult.document.schema} uiSchema={fillResult.document.uiSchema} validator={validator} formData={fillData} onChange={({ formData }) => setFillData(pruneHiddenValues(fields, formData))} onSubmit={submit}><Button type="submit">Save response</Button></Form></Stack> : <Text c="red">{fillResult.error ?? 'Resolve the duplicate field key before previewing this form.'}</Text>}</Paper></Box>}
    </AppShell.Main>
  </AppShell></MantineProvider>;
}
