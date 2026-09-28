import { describe, expect, it } from 'vitest';
import { renderPrintableHtml } from '../server/printRenderer';
import { renderSemiCarePlanHtml } from '../server/semiPrintRenderer';
import type { TemplateDocument } from '../src/domain/templateSchema';
import type { SemiCarePlanTemplate } from '../src/domain/semiCustom';

describe('print renderer', () => {
  it('renders a saved Per-SERV care-plan snapshot as printable HTML', () => {
    const carePlan: SemiCarePlanTemplate = {
      name: 'Home support plan',
      structure: 'per-serv',
      services: [{ code: 'PC-01', name: 'Showering & Grooming Assistance', category: 'Personal Care' }],
      participantFields: ['Full Legal Name & Preferred Name'],
      generalInfo: { health: ['Mobility'] },
      assignments: [{
        serviceCode: 'PC-01',
        subform: {
          id: 'personal-care',
          name: 'Personal care',
          configuration: {
            schedule: { timeFormat: 'start-end' },
            itemList: { columns: ['Description', 'Frequency'] },
            sections: { careNeeds: true },
          },
        },
      }],
    };

    const html = renderSemiCarePlanHtml(carePlan);

    expect(html).toContain('<title>Home support plan</title>');
    expect(html).toContain('Participant Details');
    expect(html).toContain('Full Legal Name &amp; Preferred Name');
    expect(html).toContain('Health Summary');
    expect(html).toContain('Mobility');
    expect(html).toContain('PC-01 · Showering &amp; Grooming Assistance');
    expect(html).toContain('Start–end time');
    expect(html).toContain('<th>Description</th>');
    expect(html).toContain('<th>Frequency</th>');
    expect(html).toContain('Care Needs');
  });

  it('renders visible builder fields into an A4 HTML document', () => {
    const template: TemplateDocument = {
      name: 'Client intake',
      fields: [
        { id: 'about', kind: 'heading', label: 'About you' },
        { id: 'name', kind: 'text', label: 'Full name' },
        { id: 'contact', kind: 'radio', label: 'Contact method', options: ['Phone', 'Email'] },
        { id: 'phone', kind: 'phone', label: 'Phone number', visibility: { controllerId: 'contact', operator: 'equals', value: 'Phone' } }
      ],
      schema: { type: 'object', properties: {} },
      uiSchema: {}
    };

    const html = renderPrintableHtml(template, { full_name: 'Ari Nguyen', contact_method: 'Email', phone_number: '0400 000 000' });

    expect(html).toContain('@page { size: A4;');
    expect(html).toContain('<title>Client intake</title>');
    expect(html).toContain('About you');
    expect(html).toContain('Full name');
    expect(html).toContain('Ari Nguyen');
    expect(html).toContain('Contact method');
    expect(html).toContain('Email');
    expect(html).not.toContain('Phone number');
    expect(html).not.toContain('0400 000 000');
  });

  it('renders blank values, layout blocks, lists, and escaped answers', () => {
    const template: TemplateDocument = {
      name: 'Care plan',
      fields: [
        { id: 'intro', kind: 'textLayout', label: 'Intro', content: 'Plan summary' },
        { id: 'details', kind: 'container', label: 'Details', children: [{ id: 'note', kind: 'textarea', label: 'Notes' }] },
        { id: 'columns', kind: 'twoColumn', label: 'Contacts', leftChildren: [{ id: 'first', kind: 'text', label: 'First' }], rightChildren: [{ id: 'second', kind: 'text', label: 'Second' }] },
        { id: 'appointments', kind: 'list', label: 'Appointments', children: [{ id: 'clinic', kind: 'text', label: 'Clinic' }] }
      ],
      schema: { type: 'object', properties: {} },
      uiSchema: {}
    };

    const html = renderPrintableHtml(template, {
      details: { notes: '<script>alert(1)</script>' },
      first: 'Ada',
      appointments: [{ clinic: 'North' }]
    });

    expect(html).toContain('Plan summary');
    expect(html).toContain('Contacts');
    expect(html).toContain('Ada');
    expect(html).toContain('Second');
    expect(html).toContain('<th>Clinic</th>');
    expect(html).toContain('<td>North</td>');
    expect(html).toContain('North');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('falls back to JSON Schema when editable fields are unavailable', () => {
    const template: TemplateDocument = {
      name: 'Schema form',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          address: { type: 'object', title: 'Address', properties: { suburb: { type: 'string', title: 'Suburb' } } }
        }
      },
      uiSchema: {}
    };

    const html = renderPrintableHtml(template, { name: 'Ari', address: { suburb: 'Newtown' } });

    expect(html).toContain('Name');
    expect(html).toContain('Ari');
    expect(html).toContain('Address');
    expect(html).toContain('Newtown');
  });

  it('presents an A4 sheet and an empty table for an unentered list', () => {
    const template: TemplateDocument = {
      name: 'Service record',
      fields: [{
        id: 'visits', kind: 'list', label: 'Visits', children: [
          { id: 'date', kind: 'date', label: 'Date' },
          { id: 'worker', kind: 'text', label: 'Worker' }
        ]
      }],
      schema: { type: 'object', properties: {} },
      uiSchema: {}
    };

    const html = renderPrintableHtml(template, {});

    expect(html).toContain('<main class="print-page">');
    expect(html).toContain('width: 210mm;');
    expect(html).toContain('min-height: 297mm;');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Date</th>');
    expect(html).toContain('<th>Worker</th>');
    expect(html).toContain('<tbody><tr><td></td><td></td></tr></tbody>');
  });

  it('renders fields from saved template pages when top-level fields are empty', () => {
    const template: TemplateDocument = {
      name: 'Paged care plan',
      fields: [],
      pages: [
        { id: 'client', title: 'Client', fields: [{ id: 'name', kind: 'text', label: 'Client name' }] },
        { id: 'support', title: 'Support', fields: [{ id: 'goal', kind: 'textarea', label: 'Goal' }] }
      ],
      schema: { type: 'object', properties: {} },
      uiSchema: {}
    };

    const html = renderPrintableHtml(template, { client_name: 'Ari', goal: 'Live independently' });

    expect(html).toContain('Client name');
    expect(html).toContain('Ari');
    expect(html).toContain('Goal');
    expect(html).toContain('Live independently');
    expect(html.indexOf('Client name')).toBeLessThan(html.indexOf('Goal'));
  });
});
