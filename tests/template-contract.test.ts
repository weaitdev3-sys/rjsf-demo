import { describe, expect, it } from 'vitest';
import { buildTemplateDocument } from '../src/domain/templateSchema';
import { safeTemplateId } from '../server/templateStore';

describe('template document contract', () => {
  it('converts ordered editable fields into an RJSF schema and uiSchema', () => {
    const template = buildTemplateDocument('Client intake', [
      { id: 'text-1728000000000-0', kind: 'text', label: 'First name', required: true, help: 'As shown on ID' },
      { id: 'radio-1728000000000-1', kind: 'radio', label: 'Contact method', required: false, options: ['Phone', 'Email'] },
      { id: 'number-1728000000000-2', kind: 'number', label: 'Age', minimum: 0 }
    ]);

    expect(template.schema).toEqual({
      title: 'Client intake',
      type: 'object',
      properties: {
        first_name: { type: 'string', title: 'First name', description: 'As shown on ID' },
        contact_method: { type: 'string', title: 'Contact method', enum: ['Phone', 'Email'] },
        age: { type: 'number', title: 'Age', minimum: 0 }
      },
      required: ['first_name']
    });
    expect(template.uiSchema).toEqual({
      first_name: { 'ui:widget': 'text' },
      contact_method: { 'ui:widget': 'radio' },
      age: { 'ui:widget': 'updown' }
    });
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
        id: 'list-1', kind: 'list', label: 'Appointments', children: [
          { id: 'date-2', kind: 'date', label: 'Appointment date', required: true },
          { id: 'time-2', kind: 'time', label: 'Appointment time', required: true },
          { id: 'select-2', kind: 'select', label: 'Clinic', options: ['North', 'South'] }
        ]
      }
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
            clinic: { type: 'string', enum: ['North', 'South'] }
          },
          required: ['appointment_date', 'appointment_time']
        }
      }
    });
    expect(template.uiSchema).toMatchObject({
      start_date: { 'ui:widget': 'date' },
      start_time: { 'ui:widget': 'time' },
      location: { 'ui:widget': 'select' },
      appointments: {
        items: {
          appointment_date: { 'ui:widget': 'date' },
          appointment_time: { 'ui:widget': 'time' },
          clinic: { 'ui:widget': 'select' }
        }
      }
    });
  });

  it('serializes a container into a nested object scope', () => {
    const template = buildTemplateDocument('Intake', [{
      id: 'container-1', kind: 'container', label: 'Contact details', children: [
        { id: 'text-1', kind: 'text', label: 'Name', required: true },
        { id: 'email-1', kind: 'email', label: 'Email' }
      ]
    }]);

    expect(template.schema.properties).toMatchObject({
      contact_details: {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          email: { type: 'string', title: 'Email' }
        },
        required: ['name']
      }
    });
    expect(template.uiSchema).toMatchObject({
      contact_details: {
        name: { 'ui:widget': 'text' },
        email: { 'ui:widget': 'email' }
      }
    });
  });

  it('allows matching child labels in separate containers', () => {
    expect(() => buildTemplateDocument('Intake', [
      { id: 'container-1', kind: 'container', label: 'Home', children: [{ id: 'text-1', kind: 'text', label: 'Postcode' }] },
      { id: 'container-2', kind: 'container', label: 'Work', children: [{ id: 'text-2', kind: 'text', label: 'Postcode' }] }
    ])).not.toThrow();
  });

  it('serializes autocomplete options and hides a container title without losing its object', () => {
    const template = buildTemplateDocument('Intake', [
      {
        id: 'container-1', kind: 'container', label: 'Contact', showLabel: false, children: [
          { id: 'autocomplete-1', kind: 'autocomplete', label: 'Suburb', options: ['Newtown', 'Surry Hills'] }
        ]
      }
    ]);

    expect(template.schema.properties).toMatchObject({
      contact: { type: 'object', properties: { suburb: { enum: ['Newtown', 'Surry Hills'] } } }
    });
    expect(template.uiSchema).toMatchObject({
      contact: { 'ui:options': { label: false }, suburb: { 'ui:widget': 'select' } }
    });
  });

  it('omits static text and flattens two-column children', () => {
    const template = buildTemplateDocument('Intake', [
      { id: 'text-layout-1', kind: 'textLayout', label: 'Notice', content: 'Keep this handy.' },
      {
        id: 'columns-1', kind: 'twoColumn', label: 'Details',
        leftChildren: [{ id: 'left-1', kind: 'text', label: 'First name' }],
        rightChildren: [{ id: 'right-1', kind: 'text', label: 'Last name' }]
      }
    ]);

    expect(template.schema.properties).toMatchObject({ first_name: { type: 'string' }, last_name: { type: 'string' } });
    expect(template.schema.properties).not.toHaveProperty('notice');
  });

  it('suffixes duplicate snake_case keys in the same scope', () => {
    const template = buildTemplateDocument('Duplicate labels', [
      { id: 'first-1', kind: 'text', label: 'First name' },
      { id: 'first-2', kind: 'text', label: 'first-name' },
      { id: 'first-3', kind: 'text', label: 'First name' }
    ]);

    expect(template.schema.properties).toMatchObject({
      first_name: { title: 'First name' },
      first_name_2: { title: 'first-name' },
      first_name_3: { title: 'First name' }
    });
  });
});
