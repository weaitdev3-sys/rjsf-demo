import type { RJSFSchema, UiSchema } from '@rjsf/utils';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'time'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'autocomplete'
  | 'heading'
  | 'list'
  | 'container'
  | 'textLayout'
  | 'twoColumn';

export type VisibilityOperator =
  | 'equals'
  | 'notEquals'
  | 'isBlank'
  | 'isNotBlank'
  | 'greaterThan'
  | 'lessThan'
  | 'isChecked'
  | 'isUnchecked';

export type LegacyVisibilityRule = {
  controllerId: string;
  operator: VisibilityOperator;
  value?: string | number;
};

export type FieldVisibilityClause = LegacyVisibilityRule & { kind: 'field'; not?: boolean };

export type ListRowVisibilityClause = {
  fieldId: string;
  operator: VisibilityOperator;
  value?: string | number;
};

export type VisibilityGroup<TClause = VisibilityClause> = {
  combinator: 'and' | 'or';
  clauses: TClause[];
};

export type ListVisibilityClause = {
  kind: 'list';
  not?: boolean;
  listId: string;
  quantifier: 'any' | 'all';
  conditions: VisibilityGroup<ListRowVisibilityClause>;
};

export type VisibilityClause = FieldVisibilityClause | ListVisibilityClause;
export type VisibilityExpressionGroup = { kind: 'group'; not?: boolean; operands: VisibilityExpression[]; operators: ('and' | 'or')[] };
export type VisibilityExpression = VisibilityClause | VisibilityExpressionGroup;
export type VisibilityRule = LegacyVisibilityRule | VisibilityGroup | VisibilityExpressionGroup;

export type EditableField = {
  id: string;
  kind: FieldKind;
  label: string;
  required?: boolean;
  help?: string;
  options?: string[];
  minimum?: number;
  maximum?: number;
  rows?: number;
  children?: EditableField[];
  showLabel?: boolean;
  content?: string;
  leftChildren?: EditableField[];
  rightChildren?: EditableField[];
  visibility?: VisibilityRule;
};

export type TemplateDocument = {
  id?: string;
  name: string;
  schema: RJSFSchema;
  uiSchema: UiSchema;
  fields?: EditableField[];
  createdAt?: string;
  updatedAt?: string;
};

export const propertyName = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';

const presentationKinds: FieldKind[] = ['heading', 'textLayout', 'twoColumn'];
const controllerKinds: FieldKind[] = ['text', 'textarea', 'number', 'email', 'phone', 'date', 'time', 'select', 'radio', 'checkbox', 'autocomplete'];
const comparisonOperators: VisibilityOperator[] = ['equals', 'notEquals', 'isBlank', 'isNotBlank'];
const numericComparisonOperators: VisibilityOperator[] = [...comparisonOperators, 'greaterThan', 'lessThan'];

type FieldReference = {
  field: EditableField;
  path?: string[];
  parentId?: string;
  listItem: boolean;
};

const uniquePropertyName = (base: string, properties: Record<string, RJSFSchema>) => {
  if (!properties[base]) return base;
  let suffix = 2;
  while (properties[`${base}_${suffix}`]) suffix += 1;
  return `${base}_${suffix}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isDataField = (field: EditableField) => !presentationKinds.includes(field.kind);

function indexFields(fields: EditableField[]): Map<string, FieldReference> {
  const references = new Map<string, FieldReference>();
  const visit = (scope: EditableField[], parentPath: string[], parentId: string | undefined, listItem: boolean, scopeProperties?: Record<string, RJSFSchema>) => {
    const properties = scopeProperties ?? {};
    for (const field of scope) {
      if (field.kind === 'heading' || field.kind === 'textLayout') {
        references.set(field.id, { field, parentId, listItem });
        continue;
      }
      if (field.kind === 'twoColumn') {
        references.set(field.id, { field, parentId, listItem });
        const columnProperties: Record<string, RJSFSchema> = {};
        const visitColumn = (children: EditableField[]) => children.forEach((child) => {
          if (child.kind === 'heading' || child.kind === 'textLayout') {
            references.set(child.id, { field: child, parentId: field.id, listItem });
            return;
          }
          if (child.kind === 'twoColumn') {
            references.set(child.id, { field: child, parentId: field.id, listItem });
            visitColumn([...(child.leftChildren ?? []), ...(child.rightChildren ?? [])]);
            return;
          }
          const columnKey = uniquePropertyName(propertyName(child.label), columnProperties);
          columnProperties[columnKey] = {};
          const key = uniquePropertyName(columnKey, properties);
          properties[key] = {};
          const path = [...parentPath, key];
          references.set(child.id, { field: child, path, parentId: field.id, listItem });
          if (child.kind === 'container') visit(child.children ?? [], path, child.id, false);
          if (child.kind === 'list') visit(child.children ?? [], path, child.id, true);
        });
        visitColumn(field.leftChildren ?? []);
        visitColumn(field.rightChildren ?? []);
        continue;
      }
      const key = uniquePropertyName(propertyName(field.label), properties);
      properties[key] = {};
      const path = [...parentPath, key];
      references.set(field.id, { field, path, parentId, listItem });
      if (field.kind === 'container') visit(field.children ?? [], path, field.id, false);
      if (field.kind === 'list') visit(field.children ?? [], path, field.id, true);
    }
  };
  visit(fields, [], undefined, false);
  return references;
}

export function buildFieldKeyMap(fields: EditableField[]): ReadonlyMap<string, string> {
  return new Map([...indexFields(fields)].flatMap(([id, reference]) => reference.path ? [[id, reference.path.at(-1)!] as const] : []));
}

export function clearVisibilityReferences(fields: EditableField[], removedIds: Iterable<string>): EditableField[] {
  const removed = new Set(removedIds);
  return fields.map((field) => ({
    ...field,
    ...(visibilityReferences(field.visibility).some((id) => removed.has(id)) ? { visibility: undefined } : {}),
    ...(field.children ? { children: clearVisibilityReferences(field.children, removed) } : {}),
    ...(field.leftChildren ? { leftChildren: clearVisibilityReferences(field.leftChildren, removed) } : {}),
    ...(field.rightChildren ? { rightChildren: clearVisibilityReferences(field.rightChildren, removed) } : {})
  }));
}

const valueAtPath = (data: unknown, path: string[] | undefined): unknown => {
  if (!path) return undefined;
  return path.reduce<unknown>((value, key) => isRecord(value) ? value[key] : undefined, data);
};

const supportedOperators = (kind: FieldKind): VisibilityOperator[] => {
  if (kind === 'checkbox') return ['isChecked', 'isUnchecked'];
  if (kind === 'number' || kind === 'date' || kind === 'time') return numericComparisonOperators;
  return comparisonOperators;
};

const isLegacyVisibilityRule = (rule: VisibilityRule): rule is LegacyVisibilityRule => 'controllerId' in rule;
const isExpressionGroup = (rule: VisibilityRule): rule is VisibilityExpressionGroup => 'operands' in rule;
const normalizeVisibilityRule = (rule: VisibilityRule): VisibilityExpressionGroup => {
  if (isLegacyVisibilityRule(rule)) return { kind: 'group', operands: [{ kind: 'field', ...rule }], operators: [] };
  if (isExpressionGroup(rule)) return rule;
  return { kind: 'group', operands: rule.clauses, operators: rule.clauses.slice(1).map(() => rule.combinator) };
};
const visibilityReferences = (rule: VisibilityRule | undefined): string[] => {
  if (!rule) return [];
  if (isLegacyVisibilityRule(rule)) return [rule.controllerId];
  const expressions = isExpressionGroup(rule) ? rule.operands : rule.clauses;
  return expressions.flatMap((clause) => clause.kind === 'group' ? visibilityReferences(clause)
    : clause.kind === 'field'
    ? [clause.controllerId]
    : [clause.listId, ...clause.conditions.clauses.map((condition) => condition.fieldId)]);
};

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const ruleMatches = (rule: LegacyVisibilityRule | ListRowVisibilityClause, value: unknown) => {
  switch (rule.operator) {
    case 'isBlank': return isBlank(value);
    case 'isNotBlank': return !isBlank(value);
    case 'isChecked': return value === true;
    case 'isUnchecked': return value === false;
    case 'equals': return value === rule.value;
    case 'notEquals': return value !== rule.value;
    case 'greaterThan': return value !== undefined && value !== null && value > rule.value!;
    case 'lessThan': return value !== undefined && value !== null && value < rule.value!;
  }
};

export function validateVisibilityRules(fields: EditableField[]) {
  const references = indexFields(fields);
  const edges = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string | undefined) => {
    if (!to) return;
    const dependencies = edges.get(from) ?? new Set<string>();
    dependencies.add(to);
    edges.set(from, dependencies);
  };
  for (const [id, reference] of references) {
    addEdge(id, reference.parentId);
    const rule = reference.field.visibility;
    if (!rule) continue;
    if (reference.listItem) throw new Error('Visibility rules are not supported for list-item fields');
    const group = normalizeVisibilityRule(rule);
    const validateGroup = (current: VisibilityExpressionGroup) => {
      if (!current.operands.length || current.operators.length !== Math.max(0, current.operands.length - 1)) throw new Error('Visibility group must contain linked conditions');
      for (const clause of current.operands) {
      if (clause.kind === 'group') { validateGroup(clause); continue; }
      if (clause.kind === 'field') {
        const controller = references.get(clause.controllerId);
        if (!controller || controller.listItem || !controllerKinds.includes(controller.field.kind)) throw new Error('Visibility rule controller must be a non-list input field');
        if (id === clause.controllerId) throw new Error('Visibility rule cannot depend on itself');
        if (!supportedOperators(controller.field.kind).includes(clause.operator)) throw new Error('Visibility rule operator is not compatible with its controller');
        if (['equals', 'notEquals', 'greaterThan', 'lessThan'].includes(clause.operator) && clause.value === undefined) throw new Error('Visibility rule requires a comparison value');
        addEdge(id, clause.controllerId);
        continue;
      }
      const list = references.get(clause.listId);
      if (!list || list.listItem || list.field.kind !== 'list') throw new Error('List visibility rule must reference a repeatable list');
      if (!clause.conditions.clauses.length) throw new Error('List visibility rule requires at least one row condition');
      for (const condition of clause.conditions.clauses) {
        const child = references.get(condition.fieldId);
        if (!child || !child.listItem || child.parentId !== clause.listId || !controllerKinds.includes(child.field.kind)) throw new Error('List visibility rule must reference a direct list-item field');
        if (!supportedOperators(child.field.kind).includes(condition.operator)) throw new Error('List visibility rule operator is not compatible with its item field');
        if (['equals', 'notEquals', 'greaterThan', 'lessThan'].includes(condition.operator) && condition.value === undefined) throw new Error('List visibility rule requires a comparison value');
      }
      addEdge(id, clause.listId);
    }
    };
    validateGroup(group);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('Visibility rule cycle detected');
    if (visited.has(id)) return;
    visiting.add(id);
    edges.get(id)?.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  references.forEach((_, id) => visit(id));
}

export function evaluateVisibleFields(fields: EditableField[], formData: unknown): EditableField[] {
  validateVisibilityRules(fields);
  const references = indexFields(fields);
  const visibility = new Map<string, boolean>();
  const fieldKeys = buildFieldKeyMap(fields);
  const isVisible = (id: string): boolean => {
    if (visibility.has(id)) return visibility.get(id)!;
    const reference = references.get(id);
    if (!reference) return false;
    if (reference.parentId && !isVisible(reference.parentId)) { visibility.set(id, false); return false; }
    const rule = reference.field.visibility;
    if (!rule) { visibility.set(id, true); return true; }
    const matches = (left: boolean, operator: 'and' | 'or', right: boolean) => operator === 'and' ? left && right : left || right;
    const evaluateExpression = (expression: VisibilityExpression): boolean => {
      const matches = (() => {
      if (expression.kind === 'group') return evaluateGroup(expression);
      if (expression.kind === 'field') {
        if (!isVisible(expression.controllerId)) return false;
        return ruleMatches(expression, valueAtPath(formData, references.get(expression.controllerId)?.path));
      }
      if (!isVisible(expression.listId)) return false;
      const rows = valueAtPath(formData, references.get(expression.listId)?.path);
      if (!Array.isArray(rows) || rows.length === 0) return false;
      const rowMatches = (row: unknown) => {
        if (!isRecord(row)) return false;
        const values = expression.conditions.clauses.map((condition) => ruleMatches(condition, row[fieldKeys.get(condition.fieldId) ?? '']));
        return expression.conditions.combinator === 'and' ? values.every(Boolean) : values.some(Boolean);
      };
      return expression.quantifier === 'any' ? rows.some(rowMatches) : rows.every(rowMatches);
      })();
      return expression.not ? !matches : matches;
    };
    const evaluateGroup = (group: VisibilityExpressionGroup): boolean => group.operands.map(evaluateExpression).reduce((result, value, index) => index === 0 ? value : matches(result, group.operators[index - 1], value), false);
    const visible = evaluateGroup(normalizeVisibilityRule(rule));
    visibility.set(id, visible);
    return visible;
  };
  const filter = (scope: EditableField[]): EditableField[] => scope.flatMap((field) => {
    if (!isVisible(field.id)) return [];
    const { visibility: _visibility, ...visibleField } = field;
    if (field.kind === 'container') return [{ ...visibleField, children: filter(field.children ?? []) }];
    if (field.kind === 'twoColumn') return [{ ...visibleField, leftChildren: filter(field.leftChildren ?? []), rightChildren: filter(field.rightChildren ?? []) }];
    return [visibleField];
  });
  return filter(fields);
}

export function pruneHiddenValues(fields: EditableField[], formData: unknown): Record<string, unknown> {
  const visibleFields = evaluateVisibleFields(fields, formData);
  const fieldKeys = buildFieldKeyMap(fields);
  const pruneScope = (scope: EditableField[], value: unknown): Record<string, unknown> => {
    if (!isRecord(value)) return {};
    const result: Record<string, unknown> = {};
    const properties: Record<string, RJSFSchema> = {};
    const consume = (items: EditableField[]) => items.forEach((field) => {
      if (field.kind === 'twoColumn') { consume(field.leftChildren ?? []); consume(field.rightChildren ?? []); return; }
      if (!isDataField(field)) return;
      const key = fieldKeys.get(field.id) ?? uniquePropertyName(propertyName(field.label), properties);
      properties[key] = {};
      const fieldValue = value[key];
      if (fieldValue === undefined) return;
      if (field.kind === 'container') result[key] = pruneScope(field.children ?? [], fieldValue);
      else if (field.kind === 'list' && Array.isArray(fieldValue)) result[key] = fieldValue.map((item) => pruneScope(field.children ?? [], item));
      else result[key] = fieldValue;
    });
    consume(scope);
    return result;
  };
  return pruneScope(visibleFields, formData);
}

export function buildTemplateDocument(name: string, fields: EditableField[], fieldKeys?: ReadonlyMap<string, string>): TemplateDocument {
  validateVisibilityRules(fields);
  const { schema, uiSchema } = buildObjectSchema(fields, fieldKeys);
  return { name, fields, schema: { title: name, ...schema }, uiSchema };
}

function buildObjectSchema(fields: EditableField[], fieldKeys?: ReadonlyMap<string, string>): { schema: RJSFSchema; uiSchema: UiSchema } {
  const properties: Record<string, RJSFSchema> = {};
  const uiSchema: UiSchema = {};
  const required: string[] = [];

  for (const field of fields) {
    if (field.kind === 'heading' || field.kind === 'textLayout') continue;
    if (field.kind === 'twoColumn') {
      const columns = buildObjectSchema([...(field.leftChildren ?? []), ...(field.rightChildren ?? [])], fieldKeys);
      for (const [key, schema] of Object.entries(columns.schema.properties ?? {})) {
        const uniqueKey = uniquePropertyName(key, properties);
        properties[uniqueKey] = schema as RJSFSchema;
        uiSchema[uniqueKey] = columns.uiSchema[key];
      }
      required.push(...((columns.schema.required as string[] | undefined) ?? []));
      continue;
    }
    const key = fieldKeys?.get(field.id) ?? uniquePropertyName(propertyName(field.label), properties);
    const nestedObject = field.kind === 'list' || field.kind === 'container'
      ? buildObjectSchema(field.children ?? [], fieldKeys)
      : undefined;
    const schema: RJSFSchema = field.kind === 'list'
      ? { type: 'array', title: field.label, items: nestedObject!.schema }
      : field.kind === 'container'
        ? { title: field.label, ...nestedObject!.schema }
      : { type: field.kind === 'number' ? 'number' : field.kind === 'checkbox' ? 'boolean' : 'string', title: field.label };
    if (field.help) schema.description = field.help;
    if (field.kind === 'date') schema.format = 'date';
    if (field.kind === 'time') schema.format = 'time';
    if (field.options?.length && field.kind !== 'list') schema.enum = field.options;
    if (field.minimum !== undefined) schema.minimum = field.minimum;
    if (field.maximum !== undefined) schema.maximum = field.maximum;
    properties[key] = schema;
    uiSchema[key] = field.kind === 'list'
      ? { items: nestedObject!.uiSchema }
      : field.kind === 'container'
        ? { ...(field.showLabel === false ? { 'ui:options': { label: false } } : {}), ...nestedObject!.uiSchema }
      : { 'ui:widget': field.kind === 'number' ? 'updown' : field.kind === 'phone' ? 'tel' : field.kind === 'checkbox' ? 'checkbox' : field.kind === 'autocomplete' ? 'select' : field.kind };
    if (field.required) required.push(key);
  }

  return { schema: { type: 'object', properties, ...(required.length ? { required } : {}) }, uiSchema };
}
