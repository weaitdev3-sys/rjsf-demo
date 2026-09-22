import { describe, expect, it } from 'vitest';
import { buildTemplateDocument } from '../src/domain/templateSchema';
import { safeTemplateId } from '../server/templateStore';

describe('template document contract', () => {
  it('converts ordered editable fields into an RJSF schema and uiSchema', () => {
    const template = buildTemplateDocument('Client intake', [
      { id: 'first-name', kind: 'text', label: 'First name', required: true, help: 'As shown on ID' },
      { id: 'contact-method', kind: 'radio', label: 'Contact method', required: false, options: ['Phone', 'Email'] }
    ]);

    expect(template.schema).toEqual({
      title: 'Client intake',
      type: 'object',
      properties: {
        firstName: { type: 'string', title: 'First name', description: 'As shown on ID' },
        contactMethod: { type: 'string', title: 'Contact method', enum: ['Phone', 'Email'] }
      },
      required: ['firstName']
    });
    expect(template.uiSchema).toEqual({
      firstName: { 'ui:widget': 'text' },
      contactMethod: { 'ui:widget': 'radio' }
    });
  });

  it('permits only a simple filename-safe template identifier', () => {
    expect(safeTemplateId('client-intake_2026')).toBe('client-intake_2026');
    expect(() => safeTemplateId('../../secrets')).toThrow('Invalid template id');
  });
});
