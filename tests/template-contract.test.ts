import { describe, expect, it } from 'vitest';
import {
  buildFieldKeyMap,
  buildTemplateDocument,
  clearVisibilityReferences,
  evaluateVisibleFields,
  flattenTemplateFields,
  pruneHiddenValues,
  validateVisibilityRules,
  type EditableField,
  type TemplatePage,
} from '../src/domain/templateSchema';
import { defaultStorageRoot, safeTemplateId } from '../server/templateStore';
import {
  createEmptySemiCarePlanResponseData,
  isSemiCarePlanResponseData,
} from '../src/domain/response';

describe('template document contract', () => {
  it('creates care-plan response fields from its saved configuration and rejects non-string cell values', () => {
    const template = {
      id: 'home-support',
      name: 'Home support',
      structure: 'per-serv' as const,
      services: [{ code: 'DOM-01', name: 'Domestic support', category: 'Domestic' }],
      participantFields: ['Full Legal Name'],
      generalInfo: { health: ['Health Summary'] },
      assignments: [
        {
          serviceCode: 'DOM-01',
          subform: {
            id: 'domestic',
            name: 'Domestic',
            configuration: { itemList: { columns: ['Description'] }, sections: { remarks: true } },
          },
        },
      ],
    };

    expect(createEmptySemiCarePlanResponseData(template)).toEqual({
      participant: { 'Full Legal Name': '' },
      generalInfo: { health: { 'Health Summary': '' } },
      servInfo: {},
      services: { 'DOM-01': { itemList: [{ Description: '' }], sections: { remarks: '' } } },
    });
    expect(
      isSemiCarePlanResponseData({ services: { 'DOM-01': { itemList: [{ Description: 1 }] } } }),
    ).toBe(false);
  });

  it('uses the Railway volume when the process runs from /app', () => {
    expect(defaultStorageRoot('/app')).toBe('/app/data');
  });

  it('uses the local working directory outside Railway', () => {
    expect(defaultStorageRoot('/workspace/form-builder-demo')).toBe('/workspace/form-builder-demo');
  });

  it('evaluates AND and OR visibility groups while retaining legacy rules', () => {
    const fields: EditableField[] = [
      { id: 'contact', kind: 'radio', label: 'Contact', options: ['Phone', 'Email'] },
      { id: 'age', kind: 'number', label: 'Age' },
      {
        id: 'legacy',
        kind: 'text',
        label: 'Legacy',
        visibility: { controllerId: 'contact', operator: 'equals', value: 'Phone' },
      },
      {
        id: 'all',
        kind: 'text',
        label: 'All',
        visibility: {
          combinator: 'and',
          clauses: [
            { kind: 'field', controllerId: 'contact', operator: 'equals', value: 'Phone' },
            { kind: 'field', controllerId: 'age', operator: 'greaterThan', value: 17 },
          ],
        },
      },
      {
        id: 'any',
        kind: 'text',
        label: 'Any',
        visibility: {
          combinator: 'or',
          clauses: [
            { kind: 'field', controllerId: 'contact', operator: 'equals', value: 'Email' },
            { kind: 'field', controllerId: 'age', operator: 'lessThan', value: 18 },
          ],
        },
      },
    ];

    expect(
      evaluateVisibleFields(fields, { contact: 'Phone', age: 18 }).map((field) => field.id),
    ).toEqual(['contact', 'age', 'legacy', 'all']);
    expect(
      evaluateVisibleFields(fields, { contact: 'Email', age: 17 }).map((field) => field.id),
    ).toEqual(['contact', 'age', 'any']);
  });

  it('evaluates nested visibility groups with operators between conditions', () => {
    const fields: EditableField[] = [
      { id: 'x', kind: 'checkbox', label: 'X' },
      { id: 'y', kind: 'checkbox', label: 'Y' },
      { id: 'z', kind: 'checkbox', label: 'Z' },
      {
        id: 'target',
        kind: 'text',
        label: 'Target',
        visibility: {
          kind: 'group',
          operands: [
            {
              kind: 'group',
              operands: [
                { kind: 'field', controllerId: 'x', operator: 'isChecked' },
                { kind: 'field', controllerId: 'y', operator: 'isChecked' },
              ],
              operators: ['and'],
            },
            { kind: 'field', controllerId: 'z', operator: 'isChecked' },
          ],
          operators: ['or'],
        },
      },
    ];

    expect(
      evaluateVisibleFields(fields, { x: true, y: true, z: false }).map((field) => field.id),
    ).toContain('target');
    expect(
      evaluateVisibleFields(fields, { x: true, y: false, z: true }).map((field) => field.id),
    ).toContain('target');
    expect(
      evaluateVisibleFields(fields, { x: true, y: false, z: false }).map((field) => field.id),
    ).not.toContain('target');
  });

  it('negates individual conditions and nested groups', () => {
    const fields = [
      { id: 'x', kind: 'checkbox', label: 'X' },
      { id: 'y', kind: 'checkbox', label: 'Y' },
      {
        id: 'notX',
        kind: 'text',
        label: 'Not X',
        visibility: {
          kind: 'group',
          operands: [{ kind: 'field', controllerId: 'x', operator: 'isChecked', not: true }],
          operators: [],
        },
      },
      {
        id: 'notBoth',
        kind: 'text',
        label: 'Not both',
        visibility: {
          kind: 'group',
          operands: [
            {
              kind: 'group',
              not: true,
              operands: [
                { kind: 'field', controllerId: 'x', operator: 'isChecked' },
                { kind: 'field', controllerId: 'y', operator: 'isChecked' },
              ],
              operators: ['and'],
            },
          ],
          operators: [],
        },
      },
    ] as unknown as EditableField[];

    expect(evaluateVisibleFields(fields, { x: false, y: true }).map((field) => field.id)).toContain(
      'notX',
    );
    expect(evaluateVisibleFields(fields, { x: true, y: false }).map((field) => field.id)).toContain(
      'notBoth',
    );
    expect(
      evaluateVisibleFields(fields, { x: true, y: true }).map((field) => field.id),
    ).not.toContain('notBoth');
  });

  it('evaluates ANY and ALL list-row condition groups and treats empty lists as false', () => {
    const fields: EditableField[] = [
      {
        id: 'appointments',
        kind: 'list',
        label: 'Appointments',
        children: [
          { id: 'status', kind: 'select', label: 'Status', options: ['Open', 'Closed'] },
          { id: 'amount', kind: 'number', label: 'Amount' },
        ],
      },
      {
        id: 'anyOpen',
        kind: 'text',
        label: 'Any open',
        visibility: {
          combinator: 'and',
          clauses: [
            {
              kind: 'list',
              listId: 'appointments',
              quantifier: 'any',
              conditions: {
                combinator: 'and',
                clauses: [
                  { fieldId: 'status', operator: 'equals', value: 'Open' },
                  { fieldId: 'amount', operator: 'greaterThan', value: 10 },
                ],
              },
            },
          ],
        },
      },
      {
        id: 'allClosed',
        kind: 'text',
        label: 'All closed',
        visibility: {
          combinator: 'and',
          clauses: [
            {
              kind: 'list',
              listId: 'appointments',
              quantifier: 'all',
              conditions: {
                combinator: 'or',
                clauses: [
                  { fieldId: 'status', operator: 'equals', value: 'Closed' },
                  { fieldId: 'amount', operator: 'lessThan', value: 1 },
                ],
              },
            },
          ],
        },
      },
      {
        id: 'noOpen',
        kind: 'text',
        label: 'No open',
        visibility: {
          kind: 'group',
          operands: [
            {
              kind: 'list',
              not: true,
              listId: 'appointments',
              quantifier: 'any',
              conditions: {
                combinator: 'and',
                clauses: [{ fieldId: 'status', operator: 'equals', value: 'Open' }],
              },
            },
          ],
          operators: [],
        },
      },
    ];

    expect(
      evaluateVisibleFields(fields, {
        appointments: [
          { status: 'Open', amount: 11 },
          { status: 'Closed', amount: 3 },
        ],
      }).map((field) => field.id),
    ).toEqual(['appointments', 'anyOpen']);
    expect(
      evaluateVisibleFields(fields, { appointments: [{ status: 'Closed', amount: 3 }] }).map(
        (field) => field.id,
      ),
    ).toEqual(['appointments', 'allClosed', 'noOpen']);
    expect(evaluateVisibleFields(fields, { appointments: [] }).map((field) => field.id)).toEqual([
      'appointments',
      'noOpen',
    ]);
  });

  it('evaluates a conditional field and removes its hidden answer', () => {
    const fields = [
      {
        id: 'contact',
        kind: 'radio' as const,
        label: 'Contact method',
        options: ['Phone', 'Email'],
      },
      {
        id: 'phone',
        kind: 'phone' as const,
        label: 'Phone number',
        visibility: { controllerId: 'contact', operator: 'equals' as const, value: 'Phone' },
      },
    ];

    expect(
      evaluateVisibleFields(fields, { contact_method: 'Phone' }).map((field) => field.id),
    ).toEqual(['contact', 'phone']);
    expect(
      evaluateVisibleFields(fields, { contact_method: 'Email' }).map((field) => field.id),
    ).toEqual(['contact']);
    expect(
      pruneHiddenValues(fields, { contact_method: 'Email', phone_number: '0400 000 000' }),
    ).toEqual({ contact_method: 'Email' });
  });

  it('supports number comparisons and rejects circular visibility rules', () => {
    const fields = [
      { id: 'age', kind: 'number' as const, label: 'Age' },
      {
        id: 'guardian',
        kind: 'text' as const,
        label: 'Guardian name',
        visibility: { controllerId: 'age', operator: 'lessThan' as const, value: 18 },
      },
    ];

    expect(evaluateVisibleFields(fields, { age: 17 }).map((field) => field.id)).toEqual([
      'age',
      'guardian',
    ]);
    expect(evaluateVisibleFields(fields, { age: 18 }).map((field) => field.id)).toEqual(['age']);
    expect(() =>
      validateVisibilityRules([
        {
          id: 'first',
          kind: 'text' as const,
          label: 'First',
          visibility: { controllerId: 'second', operator: 'isNotBlank' as const },
        },
        {
          id: 'second',
          kind: 'text' as const,
          label: 'Second',
          visibility: { controllerId: 'first', operator: 'isNotBlank' as const },
        },
      ]),
    ).toThrow('cycle');
  });

  it('prunes a conditional container and its nested answer', () => {
    const fields = [
      { id: 'enabled', kind: 'checkbox' as const, label: 'Include details' },
      {
        id: 'details',
        kind: 'container' as const,
        label: 'Details',
        visibility: { controllerId: 'enabled', operator: 'isChecked' as const },
        children: [{ id: 'note', kind: 'text' as const, label: 'Note' }],
      },
    ];

    expect(
      evaluateVisibleFields(fields, { include_details: false }).map((field) => field.id),
    ).toEqual(['enabled']);
    expect(
      pruneHiddenValues(fields, { include_details: false, details: { note: 'private' } }),
    ).toEqual({ include_details: false });
  });

  it('keeps two-column response values when pruning', () => {
    const fields = [
      {
        id: 'columns',
        kind: 'twoColumn' as const,
        label: 'Columns',
        leftChildren: [{ id: 'first', kind: 'text' as const, label: 'First' }],
        rightChildren: [{ id: 'second', kind: 'text' as const, label: 'Second' }],
      },
    ];

    expect(pruneHiddenValues(fields, { first: 'Ada', second: 'Lovelace' })).toEqual({
      first: 'Ada',
      second: 'Lovelace',
    });
  });

  it('rejects a visibility rule that depends on one of its descendants', () => {
    expect(() =>
      validateVisibilityRules([
        {
          id: 'details',
          kind: 'container' as const,
          label: 'Details',
          visibility: { controllerId: 'name', operator: 'isNotBlank' as const },
          children: [{ id: 'name', kind: 'text' as const, label: 'Name' }],
        },
      ]),
    ).toThrow('cycle');
  });

  it('keeps generated response keys stable when a duplicate-labelled field hides', () => {
    const fields = [
      { id: 'enabled', kind: 'checkbox' as const, label: 'Include first' },
      {
        id: 'first',
        kind: 'text' as const,
        label: 'Answer',
        visibility: { controllerId: 'enabled', operator: 'isChecked' as const },
      },
      { id: 'second', kind: 'text' as const, label: 'Answer' },
    ];
    const visibleFields = evaluateVisibleFields(fields, {
      include_first: false,
      answer: 'hidden',
      answer_2: 'visible',
    });

    expect(
      pruneHiddenValues(fields, { include_first: false, answer: 'hidden', answer_2: 'visible' }),
    ).toEqual({ include_first: false, answer_2: 'visible' });
    expect(
      buildTemplateDocument('Intake', visibleFields, buildFieldKeyMap(fields)).schema.properties,
    ).toHaveProperty('answer_2');
  });

  it('reads a two-column controller from its allocated response key', () => {
    const fields = [
      { id: 'topFlag', kind: 'checkbox' as const, label: 'Flag' },
      {
        id: 'columns',
        kind: 'twoColumn' as const,
        label: 'Columns',
        leftChildren: [],
        rightChildren: [{ id: 'columnFlag', kind: 'checkbox' as const, label: 'Flag' }],
      },
      {
        id: 'note',
        kind: 'text' as const,
        label: 'Note',
        visibility: { controllerId: 'columnFlag', operator: 'isChecked' as const },
      },
    ];

    expect(
      evaluateVisibleFields(fields, { flag: false, flag_2: true }).map((field) => field.id),
    ).toContain('note');
  });

  it('preserves legacy two-column duplicate keys in the fill schema and pruned response', () => {
    const fields = [
      { id: 'top', kind: 'text' as const, label: 'Name' },
      {
        id: 'columns',
        kind: 'twoColumn' as const,
        label: 'Columns',
        leftChildren: [{ id: 'left', kind: 'text' as const, label: 'Name' }],
        rightChildren: [{ id: 'right', kind: 'text' as const, label: 'Name' }],
      },
    ];
    const legacyDocument = buildTemplateDocument('Intake', fields);
    const fillDocument = buildTemplateDocument(
      'Intake',
      evaluateVisibleFields(fields, {}),
      buildFieldKeyMap(fields),
    );

    expect(legacyDocument.schema.properties).toEqual(fillDocument.schema.properties);
    expect(pruneHiddenValues(fields, { name: 'Top', name_2: 'Left', name_2_2: 'Right' })).toEqual({
      name: 'Top',
      name_2: 'Left',
      name_2_2: 'Right',
    });
  });

  it('clears rules that reference any deleted layout descendant', () => {
    const fields = [
      {
        id: 'details',
        kind: 'container' as const,
        label: 'Details',
        children: [{ id: 'controller', kind: 'checkbox' as const, label: 'Enabled' }],
      },
      {
        id: 'note',
        kind: 'text' as const,
        label: 'Note',
        visibility: { controllerId: 'controller', operator: 'isChecked' as const },
      },
    ];

    expect(
      clearVisibilityReferences(fields, ['details', 'controller'])[1].visibility,
    ).toBeUndefined();
  });

  it('converts ordered editable fields into an RJSF schema and uiSchema', () => {
    const template = buildTemplateDocument('Client intake', [
      {
        id: 'text-1728000000000-0',
        kind: 'text',
        label: 'First name',
        required: true,
        help: 'As shown on ID',
      },
      {
        id: 'radio-1728000000000-1',
        kind: 'radio',
        label: 'Contact method',
        required: false,
        options: ['Phone', 'Email'],
      },
      { id: 'number-1728000000000-2', kind: 'number', label: 'Age', minimum: 0 },
    ]);

    expect(template.schema).toEqual({
      title: 'Client intake',
      type: 'object',
      properties: {
        first_name: { type: 'string', title: 'First name', description: 'As shown on ID' },
        contact_method: { type: 'string', title: 'Contact method', enum: ['Phone', 'Email'] },
        age: { type: 'number', title: 'Age', minimum: 0 },
      },
      required: ['first_name'],
    });
    expect(template.uiSchema).toEqual({
      first_name: { 'ui:widget': 'text' },
      contact_method: { 'ui:widget': 'radio' },
      age: { 'ui:widget': 'updown' },
    });
  });

  it('serializes multi-select values as checkbox arrays and gates fields by a selected option', () => {
    const fields: EditableField[] = [
      {
        id: 'services',
        kind: 'multiSelect',
        label: 'Approved services',
        options: ['Nursing', 'Transport'],
      },
      {
        id: 'nursing',
        kind: 'container',
        label: 'Nursing details',
        visibility: { controllerId: 'services', operator: 'includes', value: 'Nursing' },
        children: [{ id: 'goal', kind: 'text', label: 'Goal' }],
      },
    ];

    const template = buildTemplateDocument('Care plan', fields);
    expect(template.schema.properties).toMatchObject({
      approved_services: {
        type: 'array',
        items: { type: 'string', enum: ['Nursing', 'Transport'] },
      },
    });
    expect(template.uiSchema).toMatchObject({ approved_services: { 'ui:widget': 'checkboxes' } });
    expect(
      evaluateVisibleFields(fields, { approved_services: ['Nursing'] }).map((field) => field.id),
    ).toEqual(['services', 'nursing']);
    expect(
      pruneHiddenValues(fields, {
        approved_services: ['Transport'],
        nursing_details: { goal: 'Hidden' },
      }),
    ).toEqual({ approved_services: ['Transport'] });
  });

  it('flattens tab-panel fields without adding a response property for the tabs layout', () => {
    const template = buildTemplateDocument('Tabbed form', [
      {
        id: 'tabs',
        kind: 'tabs',
        label: 'Details',
        tabs: [
          {
            id: 'contact',
            label: 'Contact',
            fields: [{ id: 'email', kind: 'email', label: 'Email' }],
          },
          {
            id: 'notes',
            label: 'Notes',
            fields: [{ id: 'note', kind: 'textarea', label: 'Note' }],
          },
        ],
      },
    ]);

    expect(template.schema.properties).toMatchObject({
      email: { type: 'string' },
      note: { type: 'string' },
    });
    expect(template.schema.properties).not.toHaveProperty('details');
  });

  it('flattens paged templates so a later page can depend on an earlier page', () => {
    const pages: TemplatePage[] = [
      {
        id: 'general',
        title: 'General',
        fields: [{ id: 'services', kind: 'multiSelect', label: 'Services', options: ['Meals'] }],
      },
      {
        id: 'everyday',
        title: 'Everyday',
        fields: [
          {
            id: 'meals',
            kind: 'text',
            label: 'Meals per week',
            visibility: { controllerId: 'services', operator: 'includes', value: 'Meals' },
          },
        ],
      },
    ];

    const fields = flattenTemplateFields(pages);
    expect(buildTemplateDocument('Care plan', fields).schema.properties).toHaveProperty(
      'meals_per_week',
    );
    expect(evaluateVisibleFields(fields, { services: ['Meals'] }).map((field) => field.id)).toEqual(
      ['services', 'meals'],
    );
  });

  it('permits only a simple filename-safe template identifier', () => {
    expect(safeTemplateId('client-intake_2026')).toBe('client-intake_2026');
    expect(() => safeTemplateId('../../secrets')).toThrow('Invalid template id');
  });

  it('serializes date, time, select, and repeatable list-item fields', () => {
    const template = buildTemplateDocument('Schedule', [
      { id: 'date-1', kind: 'date', label: 'Start date' },
      { id: 'time-1', kind: 'time', label: 'Start time' },
      { id: 'select-1', kind: 'select', label: 'Location', options: ['Sydney', 'Melbourne'] },
      {
        id: 'list-1',
        kind: 'list',
        label: 'Appointments',
        children: [
          { id: 'date-2', kind: 'date', label: 'Appointment date', required: true },
          { id: 'time-2', kind: 'time', label: 'Appointment time', required: true },
          { id: 'select-2', kind: 'select', label: 'Clinic', options: ['North', 'South'] },
        ],
      },
    ]);

    expect(template.schema.properties).toMatchObject({
      start_date: { type: 'string', format: 'date' },
      start_time: { type: 'string', format: 'time' },
      location: { type: 'string', enum: ['Sydney', 'Melbourne'] },
      appointments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            appointment_date: { type: 'string', format: 'date' },
            appointment_time: { type: 'string', format: 'time' },
            clinic: { type: 'string', enum: ['North', 'South'] },
          },
          required: ['appointment_date', 'appointment_time'],
        },
      },
    });
    expect(template.uiSchema).toMatchObject({
      start_date: { 'ui:widget': 'date' },
      start_time: { 'ui:widget': 'time' },
      location: { 'ui:widget': 'select' },
      appointments: {
        items: {
          appointment_date: { 'ui:widget': 'date' },
          appointment_time: { 'ui:widget': 'time' },
          clinic: { 'ui:widget': 'select' },
        },
      },
    });
  });

  it('serializes a container into a nested object scope', () => {
    const template = buildTemplateDocument('Intake', [
      {
        id: 'container-1',
        kind: 'container',
        label: 'Contact details',
        children: [
          { id: 'text-1', kind: 'text', label: 'Name', required: true },
          { id: 'email-1', kind: 'email', label: 'Email' },
        ],
      },
    ]);

    expect(template.schema.properties).toMatchObject({
      contact_details: {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          email: { type: 'string', title: 'Email' },
        },
        required: ['name'],
      },
    });
    expect(template.uiSchema).toMatchObject({
      contact_details: {
        name: { 'ui:widget': 'text' },
        email: { 'ui:widget': 'email' },
      },
    });
  });

  it('allows matching child labels in separate containers', () => {
    expect(() =>
      buildTemplateDocument('Intake', [
        {
          id: 'container-1',
          kind: 'container',
          label: 'Home',
          children: [{ id: 'text-1', kind: 'text', label: 'Postcode' }],
        },
        {
          id: 'container-2',
          kind: 'container',
          label: 'Work',
          children: [{ id: 'text-2', kind: 'text', label: 'Postcode' }],
        },
      ]),
    ).not.toThrow();
  });

  it('serializes autocomplete options and hides a container title without losing its object', () => {
    const template = buildTemplateDocument('Intake', [
      {
        id: 'container-1',
        kind: 'container',
        label: 'Contact',
        showLabel: false,
        children: [
          {
            id: 'autocomplete-1',
            kind: 'autocomplete',
            label: 'Suburb',
            options: ['Newtown', 'Surry Hills'],
          },
        ],
      },
    ]);

    expect(template.schema.properties).toMatchObject({
      contact: { type: 'object', properties: { suburb: { enum: ['Newtown', 'Surry Hills'] } } },
    });
    expect(template.uiSchema).toMatchObject({
      contact: { 'ui:options': { label: false }, suburb: { 'ui:widget': 'select' } },
    });
  });

  it('omits static text and flattens two-column children', () => {
    const template = buildTemplateDocument('Intake', [
      { id: 'text-layout-1', kind: 'textLayout', label: 'Notice', content: 'Keep this handy.' },
      {
        id: 'columns-1',
        kind: 'twoColumn',
        label: 'Details',
        leftChildren: [{ id: 'left-1', kind: 'text', label: 'First name' }],
        rightChildren: [{ id: 'right-1', kind: 'text', label: 'Last name' }],
      },
    ]);

    expect(template.schema.properties).toMatchObject({
      first_name: { type: 'string' },
      last_name: { type: 'string' },
    });
    expect(template.schema.properties).not.toHaveProperty('notice');
  });

  it('suffixes duplicate snake_case keys in the same scope', () => {
    const template = buildTemplateDocument('Duplicate labels', [
      { id: 'first-1', kind: 'text', label: 'First name' },
      { id: 'first-2', kind: 'text', label: 'first-name' },
      { id: 'first-3', kind: 'text', label: 'First name' },
    ]);

    expect(template.schema.properties).toMatchObject({
      first_name: { title: 'First name' },
      first_name_2: { title: 'first-name' },
      first_name_3: { title: 'First name' },
    });
  });
});
