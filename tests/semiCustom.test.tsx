// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { CarePlanWorkspace, SubformWorkspace } from '../src/SemiCustom';

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
    expect(screen.getByRole('radio', { name: /Per-SERV/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getAllByTestId('workflow-chip')).toHaveLength(13);

    fireEvent.click(screen.getByRole('radio', { name: /Per-SERV/ }));
    expect(screen.getByRole('radio', { name: /Per-SERV/ })).toHaveAttribute('aria-checked', 'true');
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

    fireEvent.click(screen.getByRole('radio', { name: /Hybrid/ }));
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

    fireEvent.click(screen.getByRole('radio', { name: /Consolidated/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: 'SERV Info' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'SERV Assignment' })).not.toBeInTheDocument();
  });

  it('allows free navigation to every visible authoring step', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    render(<MantineProvider><CarePlanWorkspace /></MantineProvider>);

    fireEvent.click(screen.getByRole('button', { name: /Review & save/ }));

    expect(await screen.findByRole('heading', { name: 'Review & save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View configuration JSON' })).toBeInTheDocument();
  });

  it('configures SERVs in a table with check-all controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    render(<MantineProvider><CarePlanWorkspace /></MantineProvider>);

    fireEvent.click(screen.getByRole('button', { name: /SERV Config/ }));
    expect(await screen.findByRole('table', { name: 'SERV configuration' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check all SERVs' }));
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(11);
    fireEvent.click(screen.getByRole('button', { name: 'Uncheck all SERVs' }));
    expect(screen.getAllByRole('checkbox', { checked: false })).toHaveLength(11);
  });

  it('filters SERVs by category without clearing selected services', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<MantineProvider><CarePlanWorkspace /></MantineProvider>);

    fireEvent.click(screen.getByRole('button', { name: /SERV Config/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /DOM-01/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'SERV category' }), { target: { value: 'Nursing' } });

    expect(screen.getByText('Wound Care')).toBeInTheDocument();
    expect(screen.queryByText('General Household Cleaning')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 11 SERVs selected')).toBeInTheDocument();
  });

  it('shows subform configuration summaries and assignment guidance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 'nursing', name: 'Nursing visit', active: true, configuration: { schedule: { timeFormat: 'duration' }, itemList: { columns: ['Description', 'Frequency'] }, sections: { careNeeds: true, remarks: true } } }] }));
    render(<MantineProvider><SubformWorkspace /></MantineProvider>);

    expect(await screen.findByText('Only active subforms can be assigned to Per-SERV and Hybrid care plans.')).toBeInTheDocument();
    await screen.findByText('Nursing visit');
    expect(screen.getByText('Duration (hours)')).toBeInTheDocument();
    expect(screen.getByText('Item list · 2 columns')).toBeInTheDocument();
    expect(screen.getByText('2 narrative sections')).toBeInTheDocument();
  });
});
