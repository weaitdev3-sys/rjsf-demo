import { useEffect, useMemo, useState } from 'react';
import { Alert, AppShell, Badge, Box, Button, Checkbox, Divider, Group, MantineProvider, Modal, NumberInput, Paper, ScrollArea, Select, SimpleGrid, Stack, Tabs, Text, TextInput, Textarea, Title } from '@mantine/core';
import Form from '@rjsf/mantine';
import validator from '@rjsf/validator-ajv8';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import type { EditableField, FieldKind, FieldVisibilityClause, FormLayout, ListRowVisibilityClause, ListVisibilityClause, TemplateDocument, TemplatePage, VisibilityClause, VisibilityExpression, VisibilityExpressionGroup, VisibilityGroup, VisibilityOperator, VisibilityRule } from './domain/templateSchema';
import { buildFieldKeyMap, buildTemplateDocument, clearVisibilityReferences, evaluateVisibleFields, pruneHiddenValues, propertyName } from './domain/templateSchema';

type TemplateSummary = TemplateDocument & { id: string };
// The palette and settings type selector share this single source of field labels.
const fieldKinds: { kind: FieldKind; label: string }[] = [
  { kind: 'text', label: 'Text field' }, { kind: 'textarea', label: 'Long text' }, { kind: 'number', label: 'Number' }, { kind: 'email', label: 'Email' }, { kind: 'phone', label: 'Phone' }, { kind: 'date', label: 'Date picker' }, { kind: 'time', label: 'Time picker' }, { kind: 'select', label: 'Select' }, { kind: 'radio', label: 'Radio' }, { kind: 'checkbox', label: 'Checkbox' }, { kind: 'multiSelect', label: 'Multi-select' }, { kind: 'autocomplete', label: 'Autocomplete' }, { kind: 'list', label: 'List input' }, { kind: 'container', label: 'Container' }, { kind: 'heading', label: 'Heading' }, { kind: 'textLayout', label: 'Text' }, { kind: 'twoColumn', label: 'Two-column' }, { kind: 'tabs', label: 'Tabs' }
];
const inputKinds = fieldKinds.filter(({ kind }) => !['container', 'heading', 'textLayout', 'twoColumn', 'tabs'].includes(kind));
const listChildKinds = inputKinds.filter(({ kind }) => kind !== 'list');
const containerChildKinds = listChildKinds;
const layoutKinds = fieldKinds.filter(({ kind }) => ['container', 'heading', 'textLayout', 'twoColumn', 'tabs'].includes(kind));
const kindLabel = (kind: FieldKind) => fieldKinds.find((item) => item.kind === kind)?.label ?? 'field';
const keyedField = (field: EditableField) => !['heading', 'textLayout', 'twoColumn'].includes(field.kind);
const uniqueLabel = (label: string, siblings: EditableField[], id?: string) => {
  // Labels become property keys, so sibling labels must remain unique after normalisation.
  const keys = new Set(siblings.filter((field) => field.id !== id && keyedField(field)).map((field) => propertyName(field.label)));
  if (!keys.has(propertyName(label))) return label;
  let suffix = 2;
  while (keys.has(propertyName(`${label}_${suffix}`))) suffix += 1;
  return `${label}_${suffix}`;
};
const emptyField = (kind: FieldKind, index: number): EditableField => ({
  // Nested fields use the caller's position to keep locally-created IDs unique.
  id: `${kind}-${Date.now()}-${index}`,
  kind,
  label: kind === 'heading' ? 'Section heading' : `Untitled ${kindLabel(kind)}`,
  ...(kind === 'select' || kind === 'radio' || kind === 'multiSelect' || kind === 'autocomplete' ? { options: ['Option 1', 'Option 2'] } : {}),
  ...(kind === 'list' ? { children: [emptyField('text', 0)] } : {}),
  ...(kind === 'container' ? { children: [], showLabel: true } : {}),
  ...(kind === 'textLayout' ? { content: 'Text block' } : {}),
  ...(kind === 'twoColumn' ? { leftChildren: [], rightChildren: [] } : {})
  ,...(kind === 'tabs' ? { tabs: [{ id: 'tab-1', label: 'Tab 1', fields: [] }, { id: 'tab-2', label: 'Tab 2', fields: [] }] } : {})
});

const visibilityControllerKinds: FieldKind[] = ['text', 'textarea', 'number', 'email', 'phone', 'date', 'time', 'select', 'radio', 'checkbox', 'multiSelect', 'autocomplete'];
const visibilityOperators = (kind: FieldKind): { value: VisibilityOperator; label: string }[] => {
  if (kind === 'checkbox') return [{ value: 'isChecked', label: 'Is checked' }, { value: 'isUnchecked', label: 'Is unchecked' }];
  if (kind === 'multiSelect') return [{ value: 'includes', label: 'Includes option' }, { value: 'notIncludes', label: 'Does not include option' }];
  const base: { value: VisibilityOperator; label: string }[] = [{ value: 'equals', label: 'Equals' }, { value: 'notEquals', label: 'Does not equal' }, { value: 'isBlank', label: 'Is blank' }, { value: 'isNotBlank', label: 'Is not blank' }];
  return kind === 'number' || kind === 'date' || kind === 'time' ? [...base, { value: 'greaterThan', label: 'Is greater than' }, { value: 'lessThan', label: 'Is less than' }] : base;
};
const controllerFields = (fields: EditableField[], listItem = false): EditableField[] => fields.flatMap((field) => {
  if (field.kind === 'list') return controllerFields(field.children ?? [], true);
  if (field.kind === 'container') return [...(listItem ? [] : []), ...controllerFields(field.children ?? [], listItem)];
  if (field.kind === 'twoColumn') return [...controllerFields(field.leftChildren ?? [], listItem), ...controllerFields(field.rightChildren ?? [], listItem)];
  if (field.kind === 'tabs') return (field.tabs ?? []).flatMap((tab) => controllerFields(tab.fields, listItem));
  return !listItem && visibilityControllerKinds.includes(field.kind) ? [field] : [];
});
const allFields = (fields: EditableField[]): EditableField[] => fields.flatMap((field) => [field, ...allFields(field.children ?? []), ...allFields(field.leftChildren ?? []), ...allFields(field.rightChildren ?? []), ...(field.tabs ?? []).flatMap((tab) => allFields(tab.fields))]);
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
  // Candidate controls are excluded when their existing dependency chain already
  // reaches the field being configured.
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
  // RJSF receives only the fragment's schema, but changes are merged back into
  // the complete response so fields on other pages retain their values.
  if (fields.length === 1 && fields[0].kind === 'tabs') {
    const tabs = fields[0].tabs ?? [];
    return <Tabs defaultValue={tabs[0]?.id}><Tabs.List>{tabs.map((tab) => <Tabs.Tab key={tab.id} value={tab.id}>{tab.label}</Tabs.Tab>)}</Tabs.List>{tabs.map((tab) => <Tabs.Panel key={tab.id} value={tab.id} pt="md"><FillFieldFragment fields={tab.fields} document={document} fieldKeys={fieldKeys} formData={formData} onChange={onChange} /></Tabs.Panel>)}</Tabs>;
  }
  const keys = fields.flatMap((field) => {
    if (field.kind === 'twoColumn') return [...(field.leftChildren ?? []), ...(field.rightChildren ?? [])].flatMap((child) => fieldKeys.get(child.id) ?? []);
    const key = fieldKeys.get(field.id);
    return key ? [key] : [];
  });
  const properties = document.schema.properties ?? {};
  const selectedProperties = Object.fromEntries(keys.flatMap((key) => properties[key] ? [[key, properties[key]] as const] : []));
  const selectedUiSchema = Object.fromEntries(keys.flatMap((key) => document.uiSchema[key] ? [[key, document.uiSchema[key]] as const] : [])) as UiSchema;
  const fragmentUiSchema = { ...selectedUiSchema, 'ui:submitButtonOptions': { norender: true } } as UiSchema;
  const required = ((document.schema.required as string[] | undefined) ?? []).filter((key) => keys.includes(key));
  const schema: RJSFSchema = { type: 'object', properties: selectedProperties, ...(required.length ? { required } : {}) };
  return <Form tagName="div" schema={schema} uiSchema={fragmentUiSchema} validator={validator} formData={formData} onChange={({ formData: nextData }) => onChange({ ...formData, ...(nextData as Record<string, unknown> ?? {}) })} />;
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
  const [pages, setPages] = useState<TemplatePage[]>([{ id: 'page-1', title: 'Page 1', fields: [] }]);
  const [formLayout, setFormLayout] = useState<FormLayout>({ kind: 'flat' });
  const [fillPage, setFillPage] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedChildIndex, setSelectedChildIndex] = useState<number | null>(null);
  const [selectedChildLocation, setSelectedChildLocation] = useState<'children' | 'leftChildren' | 'rightChildren' | 'tab' | null>(null);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'build' | 'fill'>('build');
  const [fillData, setFillData] = useState<Record<string, unknown>>({});

  const persistedPages = useMemo(() => pages.map((page, index) => index === activePage ? { ...page, fields } : page), [pages, activePage, fields]);
  // Build one schema for persistence and a second, page-scoped schema for the
  // current fill step. This keeps stepper navigation from duplicating submit UI.
  const allPageFields = useMemo(() => persistedPages.flatMap((page) => page.fields), [persistedPages]);
  const fillFieldKeys = useMemo(() => buildFieldKeyMap(allPageFields), [allPageFields]);

  const buildResult = useMemo(() => {
    try { return { document: { ...buildTemplateDocument(name, allPageFields), pages: persistedPages, formLayout }, error: null }; }
    catch (error) { return { document: undefined, error: error instanceof Error ? error.message : 'Invalid form definition' }; }
  }, [name, allPageFields, persistedPages, formLayout]);
  const fillResult = useMemo(() => {
    try {
      const visibleFields = evaluateVisibleFields(allPageFields, fillData);
      const renderedFields = formLayout.kind === 'stepper'
        ? visibleFields.filter((field) => persistedPages[fillPage]?.fields.some((pageField) => pageField.id === field.id))
        : visibleFields;
      return { document: buildTemplateDocument(name, visibleFields, fillFieldKeys), fields: renderedFields, error: null };
    } catch (error) { return { document: undefined, fields: [], error: error instanceof Error ? error.message : 'Invalid visibility rule' }; }
  }, [name, allPageFields, fillData, fillFieldKeys, formLayout, persistedPages, fillPage]);
  const selected = selectedIndex === null ? undefined : fields[selectedIndex];
  const selectedTab = selected?.kind === 'tabs' ? selected.tabs?.find((tab) => tab.id === selectedTabId) : undefined;
  const selectedChild = selectedChildIndex === null ? undefined
    : selectedChildLocation === 'children' && (selected?.kind === 'list' || selected?.kind === 'container') ? selected.children?.[selectedChildIndex]
    : (selectedChildLocation === 'leftChildren' || selectedChildLocation === 'rightChildren') && selected?.kind === 'twoColumn' ? selected[selectedChildLocation]?.[selectedChildIndex]
    : selectedChildLocation === 'tab' ? selectedTab?.fields[selectedChildIndex]
    : undefined;
  const editingChild = Boolean(selectedChild);
  const editable = selectedChild ?? selected;
  const clearChildSelection = () => { setSelectedChildIndex(null); setSelectedChildLocation(null); };

  const refresh = async () => { try { setTemplates(await api<TemplateSummary[]>('/api/templates')); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load templates'); } };
  useEffect(() => { void refresh(); }, []);
  const updateField = (patch: Partial<EditableField>) => {
    if (selectedIndex === null) return;
    setFields((current) => current.map((field, index) => {
      if (index !== selectedIndex) return field;
      if (selectedChildIndex === null || !selectedChildLocation) return { ...field, ...patch, ...(patch.label === undefined ? {} : { label: uniqueLabel(patch.label, current, field.id) }) };
      const updateChild = (children: EditableField[], siblings: EditableField[]) => children.map((child, childIndex) => childIndex === selectedChildIndex ? { ...child, ...patch, ...(patch.label === undefined ? {} : { label: uniqueLabel(patch.label, siblings, child.id) }) } : child);
      if (selectedChildLocation === 'children' && (field.kind === 'list' || field.kind === 'container')) return { ...field, children: updateChild(field.children ?? [], field.children ?? []) };
      if ((selectedChildLocation === 'leftChildren' || selectedChildLocation === 'rightChildren') && field.kind === 'twoColumn') {
        const siblings = [...(field.leftChildren ?? []), ...(field.rightChildren ?? [])];
        return { ...field, [selectedChildLocation]: updateChild(field[selectedChildLocation] ?? [], siblings) };
      }
      if (selectedChildLocation === 'tab' && field.kind === 'tabs' && selectedTabId) {
        const siblings = field.tabs?.flatMap((tab) => tab.fields) ?? [];
        return { ...field, tabs: field.tabs?.map((tab) => tab.id === selectedTabId ? { ...tab, fields: updateChild(tab.fields, siblings) } : tab) };
      }
      return field;
    }));
  };
  const addField = (kind: FieldKind) => { setFields((current) => { const field = emptyField(kind, current.length); return [...current, { ...field, label: uniqueLabel(field.label, current) }]; }); setSelectedIndex(fields.length); clearChildSelection(); if (kind === 'tabs') setSelectedTabId('tab-1'); };
  const addChild = (kind: FieldKind) => {
    if (selectedIndex === null || (selected?.kind !== 'list' && selected?.kind !== 'container')) return;
    const childCount = selected.children?.length ?? 0;
    setFields((current) => current.map((field, index) => {
      if (index !== selectedIndex) return field;
      const child = emptyField(kind, childCount);
      return { ...field, children: [...(field.children ?? []), { ...child, label: uniqueLabel(child.label, field.children ?? []) }] };
    }));
    setSelectedChildIndex(childCount); setSelectedChildLocation('children'); setSelectedTabId(null);
  };
  const addColumnChild = (side: 'leftChildren' | 'rightChildren', kind: FieldKind) => {
    if (selectedIndex === null || selected?.kind !== 'twoColumn') return;
    setFields((current) => current.map((field, index) => {
      if (index !== selectedIndex) return field;
      const child = emptyField(kind, field[side]?.length ?? 0);
      const siblings = [...(field.leftChildren ?? []), ...(field.rightChildren ?? [])];
      return { ...field, [side]: [...(field[side] ?? []), { ...child, label: uniqueLabel(child.label, siblings) }] };
    }));
    setSelectedChildIndex(selected[side]?.length ?? 0); setSelectedChildLocation(side); setSelectedTabId(null);
  };
  const addTabChild = (kind: FieldKind) => {
    if (selectedIndex === null || selected?.kind !== 'tabs' || !selectedTab) return;
    const childCount = selectedTab.fields.length;
    setFields((current) => current.map((field, index) => {
      if (index !== selectedIndex || field.kind !== 'tabs') return field;
      const siblings = field.tabs?.flatMap((tab) => tab.fields) ?? [];
      return { ...field, tabs: field.tabs?.map((tab) => tab.id === selectedTab.id ? (() => { const child = emptyField(kind, childCount); return { ...tab, fields: [...tab.fields, { ...child, label: uniqueLabel(child.label, siblings) }] }; })() : tab) };
    }));
    setSelectedChildIndex(childCount); setSelectedChildLocation('tab'); setSelectedTabId(selectedTab.id);
  };
  const addTab = () => {
    if (selectedIndex === null || selected?.kind !== 'tabs') return;
    const tab = { id: `tab-${Date.now()}`, label: `Tab ${(selected.tabs?.length ?? 0) + 1}`, fields: [] };
    setFields((current) => current.map((field, index) => index === selectedIndex && field.kind === 'tabs' ? { ...field, tabs: [...(field.tabs ?? []), tab] } : field));
    setSelectedTabId(tab.id); setSelectedChildIndex(null); setSelectedChildLocation(null);
  };
  const updateTabLabel = (label: string) => {
    if (selectedIndex === null || selected?.kind !== 'tabs' || !selectedTabId) return;
    setFields((current) => current.map((field, index) => index === selectedIndex && field.kind === 'tabs' ? { ...field, tabs: field.tabs?.map((tab) => tab.id === selectedTabId ? { ...tab, label } : tab) } : field));
  };
  const moveTab = (direction: -1 | 1) => {
    if (selectedIndex === null || selected?.kind !== 'tabs' || !selectedTabId) return;
    const tabIndex = selected.tabs?.findIndex((tab) => tab.id === selectedTabId) ?? -1;
    const next = tabIndex + direction;
    if (tabIndex < 0 || next < 0 || next >= (selected.tabs?.length ?? 0)) return;
    setFields((current) => current.map((field, index) => {
      if (index !== selectedIndex || field.kind !== 'tabs') return field;
      const tabs = [...(field.tabs ?? [])]; [tabs[tabIndex], tabs[next]] = [tabs[next], tabs[tabIndex]];
      return { ...field, tabs };
    }));
  };
  const removeTab = () => {
    if (selectedIndex === null || selected?.kind !== 'tabs' || !selectedTabId || (selected.tabs?.length ?? 0) <= 1) return;
    const tabIndex = selected.tabs?.findIndex((tab) => tab.id === selectedTabId) ?? -1;
    const removed = selected.tabs?.[tabIndex];
    const nextTabId = selected.tabs?.[tabIndex + 1]?.id ?? selected.tabs?.[tabIndex - 1]?.id ?? null;
    setFields((current) => clearVisibilityReferences(current.map((field, index) => index === selectedIndex && field.kind === 'tabs' ? { ...field, tabs: field.tabs?.filter((tab) => tab.id !== selectedTabId) } : field), removed ? allFields(removed.fields).map((field) => field.id) : []));
    setSelectedTabId(nextTabId); setSelectedChildIndex(null); setSelectedChildLocation(null);
  };
  const moveTopLevelField = (direction: -1 | 1) => {
    if (selectedIndex === null) return;
    const next = selectedIndex + direction;
    if (next < 0 || next >= fields.length) return;
    setFields((current) => { const copied = [...current]; [copied[selectedIndex], copied[next]] = [copied[next], copied[selectedIndex]]; return copied; }); setSelectedIndex(next);
  };
  const moveChildField = (direction: -1 | 1) => {
    if (selectedIndex === null || selectedChildIndex === null || !selectedChildLocation) return;
    const childFields = selectedChildLocation === 'children' ? selected?.children
      : selectedChildLocation === 'tab' ? selectedTab?.fields
      : selected?.kind === 'twoColumn' ? selected[selectedChildLocation] : undefined;
    const next = selectedChildIndex + direction;
    if (next < 0 || next >= (childFields?.length ?? 0)) return;
    const move = (children: EditableField[]) => { const copied = [...children]; [copied[selectedChildIndex], copied[next]] = [copied[next], copied[selectedChildIndex]]; return copied; };
    setFields((current) => current.map((field, index) => {
      if (index !== selectedIndex) return field;
      if (selectedChildLocation === 'children' && (field.kind === 'list' || field.kind === 'container')) return { ...field, children: move(field.children ?? []) };
      if ((selectedChildLocation === 'leftChildren' || selectedChildLocation === 'rightChildren') && field.kind === 'twoColumn') return { ...field, [selectedChildLocation]: move(field[selectedChildLocation] ?? []) };
      if (selectedChildLocation === 'tab' && field.kind === 'tabs' && selectedTabId) return { ...field, tabs: field.tabs?.map((tab) => tab.id === selectedTabId ? { ...tab, fields: move(tab.fields) } : tab) };
      return field;
    })); setSelectedChildIndex(next);
  };
  const removeSelected = () => {
    if (selectedIndex === null) return;
    if (selectedChildIndex !== null && selectedChild && selectedChildLocation) {
      const removedIds = allFields([selectedChild]).map((field) => field.id);
      // A deleted subtree can be referenced by several rules, so clear every ID
      // it owns before returning to the parent editor.
      setFields((current) => clearVisibilityReferences(current.map((field, index) => {
        if (index !== selectedIndex) return field;
        if (selectedChildLocation === 'children' && (field.kind === 'list' || field.kind === 'container')) return { ...field, children: field.children?.filter((_, childIndex) => childIndex !== selectedChildIndex) };
        if ((selectedChildLocation === 'leftChildren' || selectedChildLocation === 'rightChildren') && field.kind === 'twoColumn') return { ...field, [selectedChildLocation]: field[selectedChildLocation]?.filter((_, childIndex) => childIndex !== selectedChildIndex) };
        if (selectedChildLocation === 'tab' && field.kind === 'tabs' && selectedTabId) return { ...field, tabs: field.tabs?.map((tab) => tab.id === selectedTabId ? { ...tab, fields: tab.fields.filter((_, childIndex) => childIndex !== selectedChildIndex) } : tab) };
        return field;
      }), removedIds)); clearChildSelection(); return;
    }
    const removedIds = selected ? allFields([selected]).map((field) => field.id) : [];
    setFields((current) => clearVisibilityReferences(current.filter((_, index) => index !== selectedIndex), removedIds)); setSelectedIndex(null); clearChildSelection();
  };
  const createNew = () => { setOpenedId(null); setName('Untitled form'); setFields([]); setPages([{ id: 'page-1', title: 'Page 1', fields: [] }]); setFormLayout({ kind: 'flat' }); setActivePage(0); setFillPage(0); setSelectedIndex(null); setSelectedChildIndex(null); setFillData({}); setMode('build'); setMessage(null); };
  const openTemplate = async (id: string) => {
    // Older saved templates predate pages and layouts; load them as one Page 1.
    try { const template = await api<TemplateSummary>(`/api/templates/${id}`); const loadedPages = template.pages?.length ? template.pages : [{ id: 'page-1', title: 'Page 1', fields: template.fields ?? [] }]; setOpenedId(template.id); setName(template.name); setPages(loadedPages); setFormLayout(template.formLayout ?? { kind: 'flat' }); setActivePage(0); setFillPage(0); setFields(loadedPages[0].fields); setSelectedIndex(null); setSelectedChildIndex(null); setFillData({}); setMode('build'); setMessage(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open template'); }
  };
  const addPage = () => {
    // Use the highest existing Page N rather than the array length, avoiding a
    // duplicate title when a middle page has been removed.
    const nextPageNumber = pages.reduce((max, page) => {
      const number = /^Page (\d+)$/.exec(page.title)?.[1];
      return Math.max(max, number ? Number(number) : 0);
    }, 0) + 1;
    const page = { id: `page-${Date.now()}`, title: `Page ${nextPageNumber}`, fields: [] };
    setPages((current) => [...current.map((item, index) => index === activePage ? { ...item, fields } : item), page]);
    setFields([]); setActivePage(pages.length); setSelectedIndex(null); setSelectedChildIndex(null);
  };
  const updatePageTitle = (title: string) => setPages((current) => current.map((page, index) => index === activePage ? { ...page, title } : page));
  const removePage = () => {
    // A template always retains one editable page and selects the preceding page
    // after a removal so the builder never has an invalid active index.
    if (pages.length === 1) return;
    const nextPages = persistedPages.filter((_, index) => index !== activePage);
    const nextIndex = Math.max(0, activePage - 1);
    setPages(nextPages); setActivePage(nextIndex); setFields(nextPages[nextIndex].fields); setSelectedIndex(null); setSelectedChildIndex(null);
  };
  const save = async () => {
    if (!buildResult.document) { setMessage(buildResult.error ?? 'Fix the form definition before saving.'); return; }
    try { const saved = await api<TemplateSummary>('/api/templates', { method: 'POST', body: JSON.stringify({ ...buildResult.document, id: openedId ?? undefined }) }); setOpenedId(saved.id); setMessage(`Saved “${saved.name}”`); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save template'); }
  };
  const submit = async ({ formData }: { formData?: unknown }) => {
    // Prune stale hidden values immediately before persistence as the final guard.
    if (!openedId) { setMessage('Save this form before collecting responses.'); return; }
    try { await api('/api/submissions', { method: 'POST', body: JSON.stringify({ templateId: openedId, formData: pruneHiddenValues(fields, formData ?? fillData) }) }); setMessage('Response saved locally.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save response'); }
  };
  const print = async () => {
    if (!openedId) { setMessage('Save this form before printing.'); return; }
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setMessage('Allow pop-ups to print this form.'); return; }
    try {
      const response = await fetch(`/api/templates/${openedId}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData: pruneHiddenValues(allPageFields, fillData) })
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Could not create printable form');
      printWindow.document.write(await response.text());
      printWindow.document.close();
      printWindow.print();
    } catch (error) {
      printWindow.close();
      setMessage(error instanceof Error ? error.message : 'Could not create printable form');
    }
  };
  const editorKinds = editingChild ? (selected?.kind === 'list' ? listChildKinds : containerChildKinds) : fieldKinds;

  return <MantineProvider defaultColorScheme="light"><AppShell padding={0} navbar={{ width: 280, breakpoint: 'sm' }}>
    <AppShell.Navbar p="md" className="sidebar"><Group justify="space-between" mb="xl"><Title order={3}>Form Foundry</Title><Badge color="violet">local</Badge></Group><Button fullWidth onClick={createNew} mb="md">+ New template</Button><Text size="xs" fw={700} c="dimmed" tt="uppercase" mb="xs">Template library</Text><ScrollArea flex={1}>{templates.map((template) => <Button key={template.id} variant={openedId === template.id ? 'light' : 'subtle'} color="dark" justify="start" fullWidth onClick={() => void openTemplate(template.id)}>{template.name}</Button>)}</ScrollArea></AppShell.Navbar>
    <AppShell.Main><Box p="lg" className="topbar"><Group justify="space-between"><Box><Text size="sm" c="dimmed">Reusable JSON-schema templates</Text><TextInput value={name} onChange={(event) => setName(event.currentTarget.value)} variant="unstyled" aria-label="Template name" styles={{ input: { fontSize: '1.5rem', fontWeight: 700 } }} /></Box><Group><Button variant={mode === 'build' ? 'filled' : 'light'} onClick={() => setMode('build')}>Build</Button><Button variant={mode === 'fill' ? 'filled' : 'light'} onClick={() => setMode('fill')}>Fill form</Button><Button onClick={() => void save()}>Save template</Button></Group></Group></Box>
      {(message || buildResult.error) && <Alert color={buildResult.error ? 'red' : 'violet'} m="lg" withCloseButton={!buildResult.error} onClose={() => setMessage(null)}>{buildResult.error ?? message}</Alert>}
      {mode === 'fill' && formLayout.kind === 'stepper' && <Paper p="md" mx="auto" mt="lg" maw={760} withBorder><Group justify="space-between"><Text>Step {fillPage + 1} of {persistedPages.length}</Text><Group>{persistedPages.map((page, index) => <Button key={page.id} size="xs" variant={index === fillPage ? 'filled' : 'light'} disabled={formLayout.navigation === 'sequential' && index > fillPage + 1} onClick={() => setFillPage(index)}>{page.title}</Button>)}</Group><Group><Button variant="default" disabled={fillPage === 0} onClick={() => setFillPage((current) => current - 1)}>Back</Button><Button disabled={fillPage === persistedPages.length - 1} onClick={() => setFillPage((current) => current + 1)}>Next</Button></Group></Group></Paper>}
      {mode === 'build' && <Paper p="md" mx="lg" mt="lg" withBorder><Group><Text fw={600}>Form layout</Text><Select aria-label="Form layout" data={[{ value: 'flat', label: 'Flat form' }, { value: 'stepper', label: 'Stepper' }]} value={formLayout.kind} onChange={(kind) => setFormLayout(kind === 'stepper' ? { kind: 'stepper', navigation: 'sequential' } : { kind: 'flat' })} />{formLayout.kind === 'stepper' && <Select aria-label="Stepper navigation" data={[{ value: 'sequential', label: 'Sequential with revisit' }, { value: 'free', label: 'Free navigation' }]} value={formLayout.navigation} onChange={(navigation) => navigation && setFormLayout({ kind: 'stepper', navigation: navigation as 'sequential' | 'free' })} />}<Button variant="light" color="red" disabled={pages.length === 1} onClick={removePage}>Remove page</Button></Group></Paper>}
      {mode === 'build' ? <><Paper p="md" mx="lg" mt="lg" withBorder><Group><Text fw={600}>Pages</Text><Select aria-label="Active page" data={persistedPages.map((page, index) => ({ value: String(index), label: page.title }))} value={String(activePage)} onChange={(value) => { const next = Number(value); if (Number.isNaN(next) || next === activePage) return; setPages((current) => current.map((page, index) => index === activePage ? { ...page, fields } : page)); setFields(persistedPages[next].fields); setActivePage(next); setSelectedIndex(null); setSelectedChildIndex(null); }} /><TextInput label="Page title" value={persistedPages[activePage]?.title ?? ''} onChange={(event) => updatePageTitle(event.currentTarget.value)} /><Button onClick={addPage}>Add page</Button></Group></Paper><SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg" p="lg" className="workspace">
        <Paper p="md" withBorder><Title order={4} mb="sm">Fields</Title><Stack gap="xs">{inputKinds.map(({ kind, label }) => <Button key={kind} variant="light" color="violet" onClick={() => addField(kind)} aria-label={`Add ${label.toLowerCase()}`}>+ {label}</Button>)}</Stack><Divider my="md" /><Title order={4} mb="sm">Layout</Title><Stack gap="xs">{layoutKinds.map(({ kind, label }) => <Button key={kind} variant="light" color="violet" onClick={() => addField(kind)} aria-label={`Add ${label.toLowerCase()}`}>+ {label}</Button>)}</Stack></Paper>
        <Paper p="md" withBorder><Group justify="space-between" mb="sm"><Title order={4}>Form canvas</Title><Badge variant="light">{fields.length} blocks</Badge></Group><Stack gap="sm">{fields.length === 0 && <Text c="dimmed" ta="center" py="xl">Choose a field from the palette to begin.</Text>}{fields.map((field, index) => <Paper key={field.id} p="sm" withBorder className={selectedIndex === index ? 'selected-field' : ''} onClick={() => { setSelectedIndex(index); setSelectedChildIndex(null); setSelectedChildLocation(null); setSelectedTabId(field.kind === 'tabs' ? field.tabs?.[0]?.id ?? null : null); }} style={{ cursor: 'pointer' }}>{field.kind === 'heading' ? <Title order={4}>{field.label}</Title> : field.kind === 'textLayout' ? <Text>{field.content}</Text> : field.kind === 'twoColumn' ? <><Text fw={600}>{field.label}</Text><div className="two-column-layout">{(['leftChildren', 'rightChildren'] as const).map((side) => <Stack key={side} gap={4}><Text size="xs" c="dimmed">{side === 'leftChildren' ? 'Left column' : 'Right column'}</Text>{field[side]?.map((child, childIndex) => <Paper key={child.id} p={6} withBorder onClick={(event) => { event.stopPropagation(); setSelectedIndex(index); setSelectedChildIndex(childIndex); setSelectedChildLocation(side); setSelectedTabId(null); }} className={selectedIndex === index && selectedChildLocation === side && selectedChildIndex === childIndex ? 'selected-child' : ''}><Text size="sm">{child.label}</Text></Paper>)}</Stack>)}</div></> : field.kind === 'tabs' ? <><Text fw={600}>{field.label}</Text><Tabs value={selectedIndex === index ? selectedTabId : field.tabs?.[0]?.id} onChange={(tabId) => { setSelectedIndex(index); setSelectedChildIndex(null); setSelectedChildLocation(null); setSelectedTabId(tabId); }} mt="xs"><Tabs.List>{field.tabs?.map((tab) => <Tabs.Tab key={tab.id} value={tab.id}>{tab.label}</Tabs.Tab>)}</Tabs.List>{field.tabs?.map((tab) => <Tabs.Panel key={tab.id} value={tab.id} pt="sm"><Stack gap={4}>{tab.fields.map((child, childIndex) => <Paper key={child.id} p={6} withBorder onClick={(event) => { event.stopPropagation(); setSelectedIndex(index); setSelectedChildIndex(childIndex); setSelectedChildLocation('tab'); setSelectedTabId(tab.id); }} className={selectedIndex === index && selectedChildLocation === 'tab' && selectedTabId === tab.id && selectedChildIndex === childIndex ? 'selected-child' : ''}><Text size="sm">{child.label}</Text><Text size="xs" c="dimmed">{child.kind}</Text></Paper>)}</Stack></Tabs.Panel>)}</Tabs></> : <><Text fw={600}>{field.label}</Text><Text size="xs" c="dimmed">{field.kind}{field.required ? ' · required' : ''}{field.kind === 'list' ? ` · ${field.children?.length ?? 0} item fields` : ''}{field.kind === 'container' ? ` · ${field.children?.length ?? 0} fields` : ''}</Text>{(field.kind === 'list' || field.kind === 'container') && <Stack gap={4} mt="xs" className={field.kind === 'container' ? 'container-children' : undefined}>{field.children?.map((child, childIndex) => <Paper key={child.id} p={6} withBorder onClick={(event) => { event.stopPropagation(); setSelectedIndex(index); setSelectedChildIndex(childIndex); setSelectedChildLocation('children'); setSelectedTabId(null); }} className={selectedChildIndex === childIndex && selectedIndex === index && selectedChildLocation === 'children' ? 'selected-child' : ''}><Text size="sm">{child.label}</Text><Text size="xs" c="dimmed">{child.kind}</Text></Paper>)}</Stack>}</>}</Paper>)}</Stack></Paper>
        <Paper p="md" withBorder><Title order={4} mb="sm">Field settings</Title>{selected?.kind === 'twoColumn' && !editingChild ? <Stack><TextInput label="Field label" value={selected.label} onChange={(event) => updateField({ label: event.currentTarget.value })} /><VisibilitySettings fields={fields} field={selected} onChange={(visibility) => updateField({ visibility })} /><Divider /><Title order={5}>Left column</Title><Group gap="xs">{containerChildKinds.map(({ kind, label }) => <Button key={kind} size="xs" variant="light" onClick={() => addColumnChild('leftChildren', kind)} aria-label={`Add ${label.toLowerCase()} to left column`}>+ {label}</Button>)}</Group><Title order={5}>Right column</Title><Group gap="xs">{containerChildKinds.map(({ kind, label }) => <Button key={kind} size="xs" variant="light" onClick={() => addColumnChild('rightChildren', kind)} aria-label={`Add ${label.toLowerCase()} to right column`}>+ {label}</Button>)}</Group><Button color="red" variant="light" onClick={removeSelected}>Delete two-column layout</Button></Stack> : selected?.kind === 'tabs' && !editingChild ? <Stack><TextInput label="Field label" value={selected.label} onChange={(event) => updateField({ label: event.currentTarget.value })} /><VisibilitySettings fields={fields} field={selected} onChange={(visibility) => updateField({ visibility })} /><Divider /><Title order={5}>Tabs</Title><Group gap="xs"><Button size="xs" variant="light" onClick={addTab}>Add tab</Button><Button size="xs" variant="light" onClick={() => moveTab(-1)}>Move tab left</Button><Button size="xs" variant="light" onClick={() => moveTab(1)}>Move tab right</Button><Button size="xs" color="red" variant="light" disabled={(selected.tabs?.length ?? 0) <= 1} onClick={removeTab}>Delete tab</Button></Group>{selectedTab && <><TextInput label="Tab label" value={selectedTab.label} onChange={(event) => updateTabLabel(event.currentTarget.value)} /><Title order={5}>{selectedTab.label} fields</Title><Group gap="xs">{containerChildKinds.map(({ kind, label }) => <Button key={kind} size="xs" variant="light" onClick={() => addTabChild(kind)} aria-label={`Add ${label.toLowerCase()} to tab`}>+ {label}</Button>)}</Group><Text size="sm" c="dimmed">Select a field in the active tab to configure it.</Text></>}<Button color="red" variant="light" onClick={removeSelected}>Delete tabs layout</Button></Stack> : selected?.kind === 'textLayout' ? <Stack><Textarea label="Text content" value={selected.content ?? ''} onChange={(event) => updateField({ content: event.currentTarget.value })} /><VisibilitySettings fields={fields} field={selected} onChange={(visibility) => updateField({ visibility })} /><Button color="red" variant="light" onClick={removeSelected}>Delete text</Button></Stack> : (selected?.kind === 'list' || selected?.kind === 'container') && !editingChild ? <Stack><TextInput label="Field label" value={selected.label} onChange={(event) => updateField({ label: event.currentTarget.value })} /><TextInput label="Help text" value={selected.help ?? ''} onChange={(event) => updateField({ help: event.currentTarget.value })} />{selected.kind === 'container' && <Checkbox label="Show label" checked={selected.showLabel !== false} onChange={(event) => updateField({ showLabel: event.currentTarget.checked })} />}{selected.kind === 'list' && <Button variant={selected.required ? 'filled' : 'light'} onClick={() => updateField({ required: !selected.required })}>{selected.required ? 'Required' : 'Optional'}</Button>}<VisibilitySettings fields={fields} field={selected} onChange={(visibility) => updateField({ visibility })} /><Divider /><Title order={5}>{selected.kind === 'container' ? 'Container fields' : 'Item fields'}</Title><Group gap="xs">{(selected.kind === 'container' ? containerChildKinds : listChildKinds).map(({ kind, label }) => <Button key={kind} size="xs" variant="light" onClick={() => addChild(kind)} aria-label={`Add ${label.toLowerCase()} field`}>+ {label}</Button>)}</Group><Text size="sm" c="dimmed">Select a child field in the canvas to configure it.</Text><Button color="red" variant="light" onClick={removeSelected}>{selected.kind === 'container' ? 'Delete container' : 'Delete list'}</Button></Stack> : editable ? <Stack>{editingChild && <Button variant="subtle" size="xs" onClick={clearChildSelection}>← Back to {selected?.kind === 'twoColumn' ? 'two-column layout' : selected?.kind === 'tabs' ? 'tabs' : selected?.kind === 'container' ? 'container' : 'list'}</Button>}<TextInput label="Field label" value={editable.label} onChange={(event) => updateField({ label: event.currentTarget.value })} /><TextInput label="Help text" value={editable.help ?? ''} onChange={(event) => updateField({ help: event.currentTarget.value })} /><Select label="Type" data={editorKinds.map((item) => ({ value: item.kind, label: item.label }))} value={editable.kind} onChange={(value) => value && updateField({ kind: value as FieldKind })} />{editable.kind !== 'heading' && <Button variant={editable.required ? 'filled' : 'light'} onClick={() => updateField({ required: !editable.required })}>{editable.required ? 'Required' : 'Optional'}</Button>}{(editable.kind === 'select' || editable.kind === 'radio' || editable.kind === 'autocomplete') && <Textarea label="Options (one per line)" value={(editable.options ?? []).join('\n')} onChange={(event) => updateField({ options: event.currentTarget.value.split('\n').filter(Boolean) })} />}{editable.kind === 'number' && <Group grow><NumberInput label="Minimum" value={editable.minimum ?? ''} onChange={(value) => updateField({ minimum: typeof value === 'number' ? value : undefined })} /><NumberInput label="Maximum" value={editable.maximum ?? ''} onChange={(value) => updateField({ maximum: typeof value === 'number' ? value : undefined })} /></Group>}{(!editingChild || selected?.kind !== 'list') && <VisibilitySettings fields={fields} field={editable} onChange={(visibility) => updateField({ visibility })} />}<Divider /><Group grow><Button variant="light" onClick={() => editingChild ? moveChildField(-1) : moveTopLevelField(-1)}>Move up</Button><Button variant="light" onClick={() => editingChild ? moveChildField(1) : moveTopLevelField(1)}>Move down</Button></Group><Button color="red" variant="light" onClick={removeSelected}>Delete field</Button></Stack> : <Text c="dimmed">Select a block to edit it.</Text>}</Paper>
      </SimpleGrid></> : <Box maw={760} mx="auto" p="xl"><Paper p="xl" withBorder>{fillResult.document ? <form noValidate onSubmit={(event) => { event.preventDefault(); if (validator.validateFormData(fillData, fillResult.document!.schema).errors.length) { setMessage('Complete the required fields before saving.'); return; } void submit({ formData: fillData }); }}><Stack gap="lg">{fillResult.fields.map((field) => field.kind === 'heading' ? <Title key={field.id} order={3}>{field.label}</Title> : field.kind === 'textLayout' ? <Text key={field.id}>{field.content}</Text> : field.kind === 'twoColumn' ? <Box key={field.id}><Text fw={600} mb="sm">{field.label}</Text><SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">{([field.leftChildren ?? [], field.rightChildren ?? []] as EditableField[][]).map((column, index) => <FillFieldFragment key={index} fields={column} document={fillResult.document!} fieldKeys={fillFieldKeys} formData={fillData} onChange={(nextData) => setFillData(pruneHiddenValues(allPageFields, nextData))} />)}</SimpleGrid></Box> : <FillFieldFragment key={field.id} fields={[field]} document={fillResult.document!} fieldKeys={fillFieldKeys} formData={fillData} onChange={(nextData) => setFillData(pruneHiddenValues(allPageFields, nextData))} />)}<Group><Button type="submit">Save response</Button><Button type="button" variant="default" disabled={!openedId} onClick={() => void print()}>Print / Save as PDF</Button></Group></Stack></form> : <Text c="red">{fillResult.error ?? 'Resolve the duplicate field key before previewing this form.'}</Text>}</Paper></Box>}
    </AppShell.Main>
  </AppShell></MantineProvider>;
}
