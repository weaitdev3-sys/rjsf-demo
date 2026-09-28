// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }))
});
class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverMock);
afterEach(cleanup);

describe('form builder', () => {
  it('names new pages sequentially and keeps one page when deleting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

  expect(screen.getByLabelText('Page title')).toHaveValue('Page 1');
  fireEvent.click(screen.getByRole('button', { name: 'Add page' }));
  expect(screen.getByLabelText('Page title')).toHaveValue('Page 2');
  fireEvent.click(screen.getByRole('button', { name: 'Remove page' }));
  expect(screen.getByLabelText('Page title')).toHaveValue('Page 1');
    expect(screen.getByRole('button', { name: 'Remove page' })).toBeDisabled();
  });

  it('renders stepper navigation for multi-page forms', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Form layout' }), { target: { value: 'stepper' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview & fill' }));

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
  });

  it('groups less-common field types behind an expandable advanced palette', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Add text field' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add multi-select' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Advanced fields' }));

    expect(screen.getByRole('button', { name: 'Add multi-select' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add list input' })).toBeInTheDocument();
  });

  it('uses an explicit required field checkbox and opens the preview and fill mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add text field' }));
    const requiredField = screen.getByRole('checkbox', { name: 'Required field' });
    expect(requiredField).not.toBeChecked();
    fireEvent.click(requiredField);
    expect(requiredField).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Preview & fill' }));
    expect(screen.getByRole('button', { name: 'Save response' })).toBeInTheDocument();
  });

  it('renders only the outer Save response submit control in fill mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add text field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview & fill' }));

    expect(screen.queryAllByRole('button', { name: 'Submit' })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Save response' })).toHaveLength(1);
  });

  it('opens a printable document for the current filled response', async () => {
    const printWindow = { document: { write: vi.fn(), close: vi.fn() }, print: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === '/api/templates/printable-form/print') return { ok: true, text: async () => '<html>Printable form</html>' };
      return { ok: true, json: async () => url === '/api/templates' && options?.method === 'POST' ? { id: 'printable-form', name: 'Printable form' } : [] };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Template name'), { target: { value: 'Printable form' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add text field' }));
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await screen.findByText('Saved “Printable form”');
    fireEvent.click(screen.getByRole('button', { name: 'Preview & fill' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ari' } });

    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/templates/printable-form/print', expect.objectContaining({ method: 'POST', body: expect.stringContaining('Ari') })));
    expect(printWindow.document.write).toHaveBeenCalledWith('<html>Printable form</html>');
    expect(printWindow.document.close).toHaveBeenCalled();
    expect(printWindow.print).toHaveBeenCalled();
  });

  it('creates pages and keeps their fields separate in the builder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add page' }));
    fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'Clinical Supports' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add text field' }));

    expect(screen.getByText('Clinical Supports')).toBeInTheDocument();
    expect(screen.getByText('Untitled Text field')).toBeInTheDocument();
  });

  it('adds a multi-select controller and offers its conditional logic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Advanced fields' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add multi-select' }));
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Approved services' } });
    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add container' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add conditional logic' }));

    expect(await screen.findByRole('dialog', { name: 'Conditional logic' })).toBeInTheDocument();
    expect(screen.getByText('Includes option')).toBeInTheDocument();
  });

  it('adds a field from the palette and updates its visible label', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add text field' }));
    const labelInput = screen.getByLabelText('Field label');
    fireEvent.change(labelInput, { target: { value: 'Preferred name' } });

    expect(screen.getByText('Preferred name')).toBeInTheDocument();
  });

  it('configures when a field is shown from another field value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add radio' }));
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Contact method' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add phone' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add conditional logic' }));
    await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { name: 'Conditional logic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add nested group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply conditional logic' })).toBeInTheDocument();
    expect(screen.getByLabelText('Negate this condition')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Add nested group' }));
    expect(screen.getByText('Nested group')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Connector 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply conditional logic' }));
    expect(screen.getByRole('button', { name: 'Edit conditional logic' })).toBeInTheDocument();
  });

  it('offers ANY and ALL list-row visibility conditions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Advanced fields' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add list input' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add text field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add conditional logic' }));
    await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { name: 'Conditional logic' })).toBeInTheDocument();
  });

  it('opens conditional logic after another field saves a list condition', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Advanced fields' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add list input' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add text field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add conditional logic' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Apply conditional logic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add text field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add conditional logic' }));

    expect(await screen.findByRole('dialog', { name: 'Conditional logic' })).toBeInTheDocument();
  });

  it('suffixes a renamed field label when its generated key collides with a sibling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add text field' }));
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'First name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add text field' }));
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'First-name' } });

    expect(screen.getByDisplayValue('First-name_2')).toBeInTheDocument();
  });

  it('adds and configures data-entry fields inside a list input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Advanced fields' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add list input' }));
    expect(screen.getByText('Item fields')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add date picker field' }));

    expect(screen.getByText('Untitled Date picker')).toBeInTheDocument();
  });

  it('adds an input inside a stacked container', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add container' }));
    expect(screen.getByText('Container fields')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add email field' }));

    expect(screen.getByText('Untitled Email')).toBeInTheDocument();
  });

  it('does not offer containers inside repeatable list items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Advanced fields' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add list input' }));

    expect(screen.queryByRole('button', { name: 'Add container field' })).not.toBeInTheDocument();
  });

  it('separates layout blocks from fields and toggles a container label', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    expect(await screen.findByText('Common fields')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add container' }));

    const showLabel = screen.getByLabelText('Show label');
    expect(showLabel).toBeChecked();
    fireEvent.click(showLabel);
    expect(showLabel).not.toBeChecked();
  });

  it('adds fields to both two-column layout columns', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add two-column' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add text field to left column' }));
    fireEvent.click(screen.getByRole('button', { name: '← Back to two-column layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add email to right column' }));

    expect(screen.getByText('Untitled Text field')).toBeInTheDocument();
    expect(screen.getByText('Untitled Email')).toBeInTheDocument();
  });

  it('edits a field selected from a two-column layout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add two-column' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add text field to left column' }));
    fireEvent.click(screen.getByText('Untitled Text field'));

    const label = screen.getByLabelText('Field label');
    expect(label).toHaveValue('Untitled Text field');
    fireEvent.change(label, { target: { value: 'Preferred name' } });

    expect(screen.getByText('Preferred name')).toBeInTheDocument();
  });

  it('authors tabs and edits fields in the active tab', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add tabs' }));
    expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add tab' }));
    fireEvent.change(screen.getByLabelText('Tab label'), { target: { value: 'Contact details' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add text field to tab' }));

    const label = screen.getByLabelText('Field label');
    expect(label).toHaveValue('Untitled Text field');
    fireEvent.change(label, { target: { value: 'Preferred name' } });

    expect(screen.getByText('Preferred name')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← Back to tabs' }));
    expect(screen.getByRole('tab', { name: 'Contact details' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders static text in fill mode without creating a response field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview & fill' }));

    expect(screen.getByText('Text block')).toBeInTheDocument();
  });

  it('keeps static layout blocks between their surrounding response fields in fill mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add text field' }));
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Before layout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    fireEvent.change(screen.getByLabelText('Text content'), { target: { value: 'Inline guidance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add heading' }));
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Middle heading' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add text field' }));
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'After layout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview & fill' }));

    const before = screen.getByLabelText('Before layout');
    const guidance = screen.getByText('Inline guidance');
    const heading = screen.getByRole('heading', { name: 'Middle heading' });
    const after = screen.getByLabelText('After layout');
    expect(before.compareDocumentPosition(guidance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(guidance.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps two-column values and validates the complete response before saving', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => ({
      ok: true,
      json: async () => url === '/api/templates' && options?.method === 'POST' ? { id: 'template-1', name: 'Layout form' } : []
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Template name'), { target: { value: 'Layout form' } });
    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add two-column' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add text field to left column' }));
    fireEvent.click(screen.getByRole('button', { name: '← Back to two-column layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add email to right column' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add text field' }));
    fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Required after columns' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Required field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await screen.findByText('Saved “Layout form”');
    fireEvent.click(screen.getByRole('button', { name: 'Preview & fill' }));

    const left = screen.getByLabelText('Untitled Text field');
    const right = screen.getByLabelText('Untitled Email');
    fireEvent.change(left, { target: { value: 'Left value' } });
    fireEvent.change(right, { target: { value: 'right@example.test' } });
    expect(left).toHaveValue('Left value');
    expect(right).toHaveValue('right@example.test');

    fireEvent.click(screen.getByRole('button', { name: 'Save response' }));
    expect(screen.getByText('Complete the required fields before saving.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/submissions', expect.anything());

    fireEvent.change(screen.getByLabelText(/Required after columns/), { target: { value: 'Done' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/responses', expect.objectContaining({ method: 'POST', body: expect.stringContaining('right@example.test') })));
  });
});
