// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { CarePlanWorkspace } from '../src/SemiCustom';

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
class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverMock);
Object.defineProperty(document, 'fonts', { value: { addEventListener: vi.fn(), removeEventListener: vi.fn() } });

afterEach(cleanup);

describe('semi-custom care-plan workflow', () => {
  it('starts with the template structure overview and assigns every selected Per-SERV service', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 'personal-care', name: 'Personal care', active: true, configuration: {} }] }));

    render(<MantineProvider><CarePlanWorkspace /></MantineProvider>);

    expect(screen.getByRole('heading', { name: 'Template Structure' })).toBeInTheDocument();
    expect(screen.getByText('Per-SERV')).toBeInTheDocument();
    expect(screen.getByText('Consolidated')).toBeInTheDocument();
    expect(screen.getByText('Hybrid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Per-SERV/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /DOM-01/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('heading', { name: 'SERV Assignment' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /DOM-01/ })).toBeInTheDocument();
  });

  it('includes SERV Info and SERV Assignment for Hybrid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 'personal-care', name: 'Personal care', active: true, configuration: {} }] }));

    render(<MantineProvider><CarePlanWorkspace /></MantineProvider>);

    fireEvent.click(screen.getByRole('button', { name: /Hybrid/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /DOM-01/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'SERV Info' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('heading', { name: 'SERV Assignment' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /DOM-01/ })).toBeInTheDocument();
  });

  it('skips SERV Assignment for Consolidated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    render(<MantineProvider><CarePlanWorkspace /></MantineProvider>);

    fireEvent.click(screen.getByRole('heading', { name: 'Consolidated' }).closest('[role="button"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: 'SERV Info' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'SERV Assignment' })).not.toBeInTheDocument();
  });
});
