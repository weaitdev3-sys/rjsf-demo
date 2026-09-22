// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }))
});
class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('form builder', () => {
  it('adds a field from the palette and updates its visible label', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add text field' }));
    const labelInput = screen.getByLabelText('Field label');
    fireEvent.change(labelInput, { target: { value: 'Preferred name' } });

    expect(screen.getByText('Preferred name')).toBeInTheDocument();
  });
});
