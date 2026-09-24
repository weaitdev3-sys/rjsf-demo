import { useEffect, useMemo, useState } from 'react';
import { Alert, AppShell, Badge, Box, Button, Checkbox, Divider, Group, MantineProvider, Modal, NumberInput, Paper, ScrollArea, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import Form from '@rjsf/mantine';
import validator from '@rjsf/validator-ajv8';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import type { EditableField, FieldKind, FieldVisibilityClause, ListRowVisibilityClause, ListVisibilityClause, TemplateDocument, VisibilityClause, VisibilityExpression, VisibilityExpressionGroup, VisibilityGroup, VisibilityOperator, VisibilityRule } from './domain/templateSchema';
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
const normalizeVisibility = (rule: VisibilityRule | undefined): VisibilityExpressionGroup | undefined => !rule ? undefined : 'controllerId' in rule
  ? { kind: 'group', operands: [{ kind: 'field', ...rule }], operators: [] }
  : 'operands' in rule ? rule
  : { kind: 'group', operands: rule.clauses, operators: rule.clauses.slice(1).map(() => rule.combinator) };
const expressionDependencies = (expression: VisibilityExpression): string[] => expression.kind === 'group'
  ? expression.operands.flatMap(expressionDependencies)
  : expression.kind === 'field' ? [expression.controllerId] : [expression.listId];
const ruleDependencies = (rule: VisibilityRule | undefined): string[] => !rule ? [] : 'controllerId' in rule
  ? [rule.controllerId]
  : 'operands' in rule ? rule.operands.flatMap(expressionDependencies)
  : rule.clauses.flatMap(expressionDependencies);
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
    if (field.id !== targetId) ruleDependencies(field.visibility).forEach((dependency) => addDependency(field.id, dependency));
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

function ConditionValue({ controller, condition, onChange }: { controller: EditableField; condition: { operator: VisibilityOperator; value?: string | number }; onChange: (condition: { operator: VisibilityOperator; value?: string | number }) => void }) {
  const needsValue = !['isBlank', 'isNotBlank', 'isChecked', 'isUnchecked'].includes(condition.operator);
  if (!needsValue) return null;
  if (controller.options?.length) return <Select label="Comparison value" data={controller.options} value={String(condition.value ?? '')} onChange={(value) => onChange({ ...condition, value: value ?? '' })} />;
  if (controller.kind === 'number') return <NumberInput label="Comparison value" value={typeof condition.value === 'number' ? condition.value : ''} onChange={(value) => onChange({ ...condition, value: typeof value === 'number' ? value : 0 })} />;
  return <TextInput label="Comparison value" type={controller.kind === 'date' || controller.kind === 'time' ? controller.kind : 'text'} value={String(condition.value ?? '')} onChange={(event) => onChange({ ...condition, value: event.currentTarget.value })} />;
}

function VisibilityEditor({ fields, field, onChange }: { fields: EditableField[]; field: EditableField; onChange: (rule: VisibilityRule | undefined) => void }) {
  const controllers = controllerFields(fields).filter((candidate) => candidate.id !== field.id && !createsVisibilityCycle(fields, field.id, candidate.id));
  const lists = allFields(fields).filter((candidate) => candidate.kind === 'list' && candidate.id !== field.id && !createsVisibilityCycle(fields, field.id, candidate.id));
  const group = normalizeVisibility(field.visibility);
  const firstFieldClause = (): FieldVisibilityClause | undefined => {
    const controller = controllers[0];
    if (!controller) return undefined;
    const operator = visibilityOperators(controller.kind)[0].value;
    return { kind: 'field', controllerId: controller.id, operator, ...(operator === 'isChecked' || operator === 'isUnchecked' ? {} : { value: controller.options?.[0] ?? '' }) };
  };
  const firstListClause = (): ListVisibilityClause | undefined => {
    const list = lists.find((candidate) => (candidate.children ?? []).some((child) => visibilityControllerKinds.includes(child.kind)));
    const child = list?.children?.find((candidate) => visibilityControllerKinds.includes(candidate.kind));
    if (!list || !child) return undefined;
    const operator = visibilityOperators(child.kind)[0].value;
    return { kind: 'list', listId: list.id, quantifier: 'any', conditions: { combinator: 'and', clauses: [{ fieldId: child.id, operator, ...(operator === 'isChecked' || operator === 'isUnchecked' ? {} : { value: child.options?.[0] ?? '' }) }] } };
  };
  const updateExpression = (next: VisibilityExpressionGroup) => onChange(next);
  const defaultExpression = () => firstFieldClause() ?? firstListClause();
  const renderListClause = (clause: ListVisibilityClause, update: (next: VisibilityClause) => void) => {
    const list = lists.find((candidate) => candidate.id === clause.listId);
    const rowFields = list?.children?.filter((candidate) => visibilityControllerKinds.includes(candidate.kind)) ?? [];
    const updateRow = (rowIndex: number, condition: ListRowVisibilityClause) => update({ ...clause, conditions: { ...clause.conditions, clauses: clause.conditions.clauses.map((item, itemIndex) => itemIndex === rowIndex ? condition : item) } });
    return <><Select label="List input" data={lists.map((candidate) => ({ value: candidate.id, label: candidate.label }))} value={clause.listId} onChange={(value) => { const nextList = lists.find((candidate) => candidate.id === value); const nextField = nextList?.children?.find((candidate) => visibilityControllerKinds.includes(candidate.kind)); if (!nextList || !nextField) return; const operator = visibilityOperators(nextField.kind)[0].value; update({ ...clause, listId: nextList.id, conditions: { combinator: 'and', clauses: [{ fieldId: nextField.id, operator, ...(operator === 'isChecked' || operator === 'isUnchecked' ? {} : { value: nextField.options?.[0] ?? '' }) }] } }); }} /><Select label="List match" data={[{ value: 'any', label: 'ANY row' }, { value: 'all', label: 'ALL rows' }]} value={clause.quantifier} onChange={(quantifier) => quantifier && update({ ...clause, quantifier: quantifier as 'any' | 'all' })} /><Select label="Row match" data={[{ value: 'and', label: 'All row conditions (AND)' }, { value: 'or', label: 'Any row condition (OR)' }]} value={clause.conditions.combinator} onChange={(combinator) => combinator && update({ ...clause, conditions: { ...clause.conditions, combinator: combinator as 'and' | 'or' } })} />{clause.conditions.clauses.map((condition, rowIndex) => { const rowField = rowFields.find((candidate) => candidate.id === condition.fieldId); if (!rowField) return null; return <Group key={rowIndex} align="end"><Select label={`Row field ${rowIndex + 1}`} data={rowFields.map((candidate) => ({ value: candidate.id, label: candidate.label }))} value={condition.fieldId} onChange={(value) => { const nextField = rowFields.find((candidate) => candidate.id === value); if (!nextField) return; const operator = visibilityOperators(nextField.kind)[0].value; updateRow(rowIndex, { fieldId: nextField.id, operator, ...(operator === 'isChecked' || operator === 'isUnchecked' ? {} : { value: nextField.options?.[0] ?? '' }) }); }} /><Select label={`Row operator ${rowIndex + 1}`} data={visibilityOperators(rowField.kind)} value={condition.operator} onChange={(operator) => operator && updateRow(rowIndex, { ...condition, operator: operator as VisibilityOperator, ...(['isBlank', 'isNotBlank', 'isChecked', 'isUnchecked'].includes(operator) ? { value: undefined } : {}) })} /><ConditionValue controller={rowField} condition={condition} onChange={(next) => updateRow(rowIndex, { ...condition, ...next })} /><Button size="xs" color="red" variant="subtle" disabled={clause.conditions.clauses.length === 1} onClick={() => update({ ...clause, conditions: { ...clause.conditions, clauses: clause.conditions.clauses.filter((_, itemIndex) => itemIndex !== rowIndex) } })}>Remove row</Button></Group>; })}<Button size="xs" variant="light" disabled={!rowFields.length} onClick={() => { const next = rowFields[0]; if (!next) return; const operator = visibilityOperators(next.kind)[0].value; update({ ...clause, conditions: { ...clause.conditions, clauses: [...clause.conditions.clauses, { fieldId: next.id, operator, ...(operator === 'isChecked' || operator === 'isUnchecked' ? {} : { value: next.options?.[0] ?? '' }) }] } }); }}>Add row condition</Button></>;
  };
  const renderOperand = (expression: VisibilityExpression, update: (next: VisibilityExpression) => void, remove: () => void, canRemove: boolean) => {
    if (expression.kind === 'group') return <Paper p="sm" withBorder bg="gray.0"><Group justify="space-between" mb="xs"><Text fw={600} size="sm">Nested group</Text><Group gap="xs"><Checkbox label="Negate this group" checked={Boolean(expression.not)} onChange={(event) => update({ ...expression, not: event.currentTarget.checked || undefined })} /><Button size="xs" color="red" variant="subtle" disabled={!canRemove} onClick={remove}>Remove group</Button></Group></Group>{renderGroup(expression, update)}</Paper>;
    const changeToField = (controllerId: string | null) => { const controller = controllers.find((candidate) => candidate.id === controllerId); if (!controller) return; const operator = visibilityOperators(controller.kind)[0].value; update({ kind: 'field', not: expression.not, controllerId: controller.id, operator, ...(operator === 'isChecked' || operator === 'isUnchecked' ? {} : { value: controller.options?.[0] ?? '' }) }); };
    return <Paper p="sm" withBorder><Stack gap="xs"><Group justify="space-between"><Text fw={600} size="sm">Condition</Text><Button size="xs" color="red" variant="subtle" disabled={!canRemove} onClick={remove}>Remove condition</Button></Group><Checkbox label="Negate this condition" checked={Boolean(expression.not)} onChange={(event) => update({ ...expression, not: event.currentTarget.checked || undefined })} /><Select label="Condition type" data={[{ value: 'field', label: 'Field value' }, { value: 'list', label: 'List rows' }]} value={expression.kind} onChange={(kind) => kind === 'field' ? changeToField(controllers[0]?.id ?? null) : (() => { const list = firstListClause(); if (list) update({ ...list, not: expression.not }); })()} />{expression.kind === 'field' ? (() => { const controller = controllers.find((candidate) => candidate.id === expression.controllerId); if (!controller) return null; return <><Select label="Show when field" data={controllers.map((candidate) => ({ value: candidate.id, label: candidate.label }))} value={expression.controllerId} onChange={changeToField} /><Select label="Operator" data={visibilityOperators(controller.kind)} value={expression.operator} onChange={(operator) => operator && update({ ...expression, operator: operator as VisibilityOperator, ...(['isBlank', 'isNotBlank', 'isChecked', 'isUnchecked'].includes(operator) ? { value: undefined } : {}) })} /><ConditionValue controller={controller} condition={expression} onChange={(condition) => update({ ...expression, ...condition })} /></>; })() : renderListClause(expression, update)}</Stack></Paper>;
  };
  const renderGroup = (current: VisibilityExpressionGroup, update: (next: VisibilityExpressionGroup) => void): React.ReactNode => <Stack gap="xs">{current.operands.map((operand, index) => <Stack key={index} gap="xs">{index > 0 && <Select aria-label={`Connector ${index}`} data={[{ value: 'and', label: 'AND' }, { value: 'or', label: 'OR' }]} value={current.operators[index - 1]} onChange={(operator) => operator && update({ ...current, operators: current.operators.map((item, itemIndex) => itemIndex === index - 1 ? operator as 'and' | 'or' : item) })} />}{renderOperand(operand, (next) => update({ ...current, operands: current.operands.map((item, itemIndex) => itemIndex === index ? next : item) }), () => update({ ...current, operands: current.operands.filter((_, itemIndex) => itemIndex !== index), operators: current.operators.filter((_, itemIndex) => itemIndex !== (index === 0 ? 0 : index - 1)) }), current.operands.length > 1)}</Stack>)}<Group><Button size="xs" variant="light" disabled={!controllers.length} onClick={() => { const clause = firstFieldClause(); if (clause) update({ ...current, operands: [...current.operands, clause], operators: [...current.operators, 'and'] }); }}>Add field condition</Button><Button size="xs" variant="light" disabled={!lists.length} onClick={() => { const clause = firstListClause(); if (clause) update({ ...current, operands: [...current.operands, clause], operators: [...current.operators, 'and'] }); }}>Add list condition</Button><Button size="xs" variant="light" disabled={!defaultExpression()} onClick={() => { const expression = defaultExpression(); if (expression) update({ ...current, operands: [...current.operands, { kind: 'group', operands: [expression], operators: [] }], operators: [...current.operators, 'and'] }); }}>Add nested group</Button></Group></Stack>;
  return <><Select label="Visibility" data={[{ value: 'always', label: 'Always show' }, ...((controllers.length || lists.length) ? [{ value: 'conditional', label: 'Show when…' }] : [])]} value={group ? 'conditional' : 'always'} onChange={(value) => { if (value === 'always') onChange(undefined); else { const expression = defaultExpression(); if (expression) updateExpression({ kind: 'group', operands: [expression], operators: [] }); } }} />{group && renderGroup(group, updateExpression)}</>;
}

function VisibilitySettings(props: { fields: EditableField[]; field: EditableField; onChange: (rule: VisibilityRule | undefined) => void }) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<VisibilityRule | undefined>();
  const beginEditing = () => { const normalized = normalizeVisibility(props.field.visibility); const controller = controllerFields(props.fields).find((candidate) => candidate.id !== props.field.id && !createsVisibilityCycle(props.fields, props.field.id, candidate.id)); const list = allFields(props.fields).find((candidate) => candidate.kind === 'list' && candidate.id !== props.field.id && !createsVisibilityCycle(props.fields, props.field.id, candidate.id) && (candidate.children ?? []).some((child) => visibilityControllerKinds.includes(child.kind))); const listChild = list?.children?.find((candidate) => visibilityControllerKinds.includes(candidate.kind)); const listOperator = listChild && visibilityOperators(listChild.kind)[0].value; const initial = normalized ?? (controller ? { kind: 'group' as const, operands: [{ kind: 'field' as const, controllerId: controller.id, operator: visibilityOperators(controller.kind)[0].value, ...(visibilityOperators(controller.kind)[0].value === 'isChecked' || visibilityOperators(controller.kind)[0].value === 'isUnchecked' ? {} : { value: controller.options?.[0] ?? '' }) }], operators: [] } : list && listChild && listOperator ? { kind: 'group' as const, operands: [{ kind: 'list' as const, listId: list.id, quantifier: 'any' as const, conditions: { combinator: 'and' as const, clauses: [{ fieldId: listChild.id, operator: listOperator, ...(listOperator === 'isChecked' || listOperator === 'isUnchecked' ? {} : { value: listChild.options?.[0] ?? '' }) }] } }], operators: [] } : undefined); setDraft(initial ? JSON.parse(JSON.stringify(initial)) as VisibilityRule : undefined); setOpened(true); };
  return <><Divider /><Title order={5}>Visibility</Title><Button variant="light" onClick={beginEditing}>{props.field.visibility ? 'Edit conditional logic' : 'Add conditional logic'}</Button><Modal opened={opened} onClose={() => setOpened(false)} title="Conditional logic" size="lg"><Stack><VisibilityEditor {...props} field={{ ...props.field, visibility: draft }} onChange={setDraft} /><Group justify="flex-end"><Button variant="default" onClick={() => setOpened(false)}>Cancel</Button><Button onClick={() => { props.onChange(draft); setOpened(false); }}>Apply conditional logic</Button></Group></Stack></Modal></>;
}

function FillFieldFragment({ fields, document, fieldKeys, formData, onChange }: { fields: EditableField[]; document: TemplateDocument; fieldKeys: ReadonlyMap<string, string>; formData: Record<string, unknown>; onChange: (formData: Record<string, unknown>) => void }) {
  const keys = fields.flatMap((field) => {
    if (field.kind === 'twoColumn') return [...(field.leftChildren ?? []), ...(field.rightChildren ?? [])].flatMap((child) => fieldKeys.get(child.id) ?? []);
    const key = fieldKeys.get(field.id);
    return key ? [key] : [];
  });
  const properties = document.schema.properties ?? {};
  const selectedProperties = Object.fromEntries(keys.flatMap((key) => properties[key] ? [[key, properties[key]] as const] : []));
  const selectedUiSchema = Object.fromEntries(keys.flatMap((key) => document.uiSchema[key] ? [[key, document.uiSchema[key]] as const] : [])) as UiSchema;
  const required = ((document.schema.required as string[] | undefined) ?? []).filter((key) => keys.includes(key));
  const schema: RJSFSchema = { type: 'object', properties: selectedProperties, ...(required.length ? { required } : {}) };
  return <Form tagName="div" schema={schema} uiSchema={selectedUiSchema} validator={validator} formData={formData} onChange={({ formData: nextData }) => onChange({ ...formData, ...(nextData as Record<string, unknown> ?? {}) })} />;
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

  const fillFieldKeys = useMemo(() => buildFieldKeyMap(fields), [fields]);

  const buildResult = useMemo(() => {
    try { return { document: buildTemplateDocument(name, fields), error: null }; }
    catch (error) { return { document: undefined, error: error instanceof Error ? error.message : 'Invalid form definition' }; }
  }, [name, fields]);
  const fillResult = useMemo(() => {
    try {
      const visibleFields = evaluateVisibleFields(fields, fillData);
      return { document: buildTemplateDocument(name, visibleFields, fillFieldKeys), fields: visibleFields, error: null };
    } catch (error) { return { document: undefined, fields: [], error: error instanceof Error ? error.message : 'Invalid visibility rule' }; }
  }, [name, fields, fillData, fillFieldKeys]);
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
      </SimpleGrid> : <Box maw={760} mx="auto" p="xl"><Paper p="xl" withBorder>{fillResult.document ? <form noValidate onSubmit={(event) => { event.preventDefault(); if (validator.validateFormData(fillData, fillResult.document!.schema).errors.length) { setMessage('Complete the required fields before saving.'); return; } void submit({ formData: fillData }); }}><Stack gap="lg">{fillResult.fields.map((field) => field.kind === 'heading' ? <Title key={field.id} order={3}>{field.label}</Title> : field.kind === 'textLayout' ? <Text key={field.id}>{field.content}</Text> : field.kind === 'twoColumn' ? <Box key={field.id}><Text fw={600} mb="sm">{field.label}</Text><SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">{([field.leftChildren ?? [], field.rightChildren ?? []] as EditableField[][]).map((column, index) => <FillFieldFragment key={index} fields={column} document={fillResult.document!} fieldKeys={fillFieldKeys} formData={fillData} onChange={(nextData) => setFillData(pruneHiddenValues(fields, nextData))} />)}</SimpleGrid></Box> : <FillFieldFragment key={field.id} fields={[field]} document={fillResult.document!} fieldKeys={fillFieldKeys} formData={fillData} onChange={(nextData) => setFillData(pruneHiddenValues(fields, nextData))} />)}<Button type="submit">Save response</Button></Stack></form> : <Text c="red">{fillResult.error ?? 'Resolve the duplicate field key before previewing this form.'}</Text>}</Paper></Box>}
    </AppShell.Main>
  </AppShell></MantineProvider>;
}
