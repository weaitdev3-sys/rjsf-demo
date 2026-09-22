// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  it('adds a field from the palette and updates its visible label', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add text field' }));
    const labelInput = screen.getByLabelText('Field label');
    fireEvent.change(labelInput, { target: { value: 'Preferred name' } });

    expect(screen.getByText('Preferred name')).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole('button', { name: 'Add list input' }));
    expect(screen.getByText('Item fields')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add date picker field' }));

    expect(screen.getByText('Untitled Date picker')).toBeInTheDocument();
  });

  it('adds an input inside a stacked container', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add container' }));
    expect(screen.getByText('Container fields')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add email field' }));

    expect(screen.getByText('Untitled Email')).toBeInTheDocument();
  });

  it('does not offer containers inside repeatable list items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add list input' }));

    expect(screen.queryByRole('button', { name: 'Add container field' })).not.toBeInTheDocument();
  });

  it('separates layout blocks from fields and toggles a container label', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    expect(await screen.findByText('Fields')).toBeInTheDocument();
    expect(screen.getByText('Layout')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add container' }));

    const showLabel = screen.getByLabelText('Show label');
    expect(showLabel).toBeChecked();
    fireEvent.click(showLabel);
    expect(showLabel).not.toBeChecked();
  });

  it('adds fields to both two-column layout columns', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add two-column' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add text field to left column' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add email to right column' }));

    expect(screen.getByText('Untitled Text field')).toBeInTheDocument();
    expect(screen.getByText('Untitled Email')).toBeInTheDocument();
  });

  it('renders static text in fill mode without creating a response field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fill form' }));

    expect(screen.getByText('Text block')).toBeInTheDocument();
  });
});
