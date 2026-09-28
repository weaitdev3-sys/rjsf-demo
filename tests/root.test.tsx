// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { Root } from '../src/Root';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

afterEach(cleanup);

describe('application routes', () => {
  it('renders the semi-custom subform route inside Mantine context', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    window.history.replaceState({}, '', '/semi/subform');

    render(<Root />);

    expect(
      await screen.findByRole('heading', { name: 'SERV subform templates' }),
    ).toBeInTheDocument();
  });

  it('keeps the application sidebar around the saved-responses route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    window.history.replaceState({}, '', '/responses');

    render(<Root />);

    expect(await screen.findByRole('heading', { name: 'Saved responses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New full-custom template' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Care-plan templates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saved responses' })).toHaveAttribute(
      'data-variant',
      'filled',
    );
  });
});
