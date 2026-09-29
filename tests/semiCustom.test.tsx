// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);
Object.defineProperty(document, 'fonts', {
  value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('semi-custom care-plan workflow', () => {
  it('starts with the template structure overview and assigns every selected Per-SERV service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 'personal-care', name: 'Personal care', active: true, configuration: {} },
        ],
      }),
    );

    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Template Structure' })).toBeInTheDocument();
    expect(screen.getByText('Per-SERV')).toBeInTheDocument();
    expect(screen.getByText('Consolidated')).toBeInTheDocument();
    expect(screen.getByText('Hybrid')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Per-SERV/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
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

  it('previews an assigned active subform using its SERV as the form heading', async () => {
    window.history.pushState({}, '', '/semi/care-plan/edit/example-plan');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url) => {
        if (url === '/api/semi/care-plans/example-plan') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'example-plan',
              name: 'Example plan',
              structure: 'per-serv',
              services: [
                {
                  category: 'Domestic Assistance',
                  code: 'DOM-01',
                  name: 'General Household Cleaning',
                },
              ],
              assignments: [
                {
                  serviceCode: 'DOM-01',
                  subform: {
                    id: 'personal-care',
                    name: 'Personal care',
                    configuration: {
                      schedule: { timeFormat: 'duration' },
                      itemList: { columns: ['Task'] },
                      sections: { careNeeds: true },
                    },
                  },
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 'personal-care',
              name: 'Personal care',
              active: true,
              configuration: {
                schedule: { timeFormat: 'duration' },
                itemList: { columns: ['Task'] },
                sections: { careNeeds: true },
              },
            },
          ],
        });
      }),
    );

    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /SERV Assignment/ }));
    const previewButton = await screen.findByRole('button', {
      name: /Preview subform for DOM-01/,
    });
    expect(previewButton).toBeEnabled();
    fireEvent.click(previewButton);

    const modal = await screen.findByRole('dialog');
    expect(
      within(modal).getByRole('heading', { name: /DOM-01.*General Household Cleaning/ }),
    ).toBeInTheDocument();
    expect(within(modal).getByLabelText('Duration (hours)')).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Add session' })).toBeDisabled();
    expect(within(modal).getByRole('button', { name: 'Add item' })).toBeDisabled();
    expect(within(modal).getByLabelText('Care Needs')).toBeInTheDocument();
  });

  it('includes SERV Info and SERV Assignment for Hybrid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 'personal-care', name: 'Personal care', active: true, configuration: {} },
        ],
      }),
    );

    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

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

    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

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

    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Review & save/ }));

    expect(await screen.findByRole('heading', { name: 'Review & save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View configuration JSON' })).toBeInTheDocument();
  });

  it('explains displayed-information selection in the Participant Details builder step', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<MantineProvider><CarePlanWorkspace /></MantineProvider>);

    fireEvent.click(screen.getByRole('button', { name: /Participant Details/ }));

    expect(await screen.findByRole('heading', { name: 'Participant Details' })).toBeInTheDocument();
    expect(screen.getByText('Select displayed information')).toBeInTheDocument();
  });

  it('configures SERVs in a table with check-all controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /SERV Config/ }));
    expect(await screen.findByRole('table', { name: 'SERV configuration' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check all SERVs' }));
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(11);
    fireEvent.click(screen.getByRole('button', { name: 'Uncheck all SERVs' }));
    expect(screen.getAllByRole('checkbox', { checked: false })).toHaveLength(11);
  });

  it('filters SERVs by category without clearing selected services', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /SERV Config/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /DOM-01/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'SERV category' }), {
      target: { value: 'Nursing' },
    });

    expect(screen.getByText('Wound Care')).toBeInTheDocument();
    expect(screen.queryByText('General Household Cleaning')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 11 SERVs selected')).toBeInTheDocument();
  });

  it('shows subform configuration summaries and assignment guidance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 'nursing',
            name: 'Nursing visit',
            active: true,
            configuration: {
              schedule: { timeFormat: 'duration' },
              itemList: { columns: ['Description', 'Frequency'] },
              sections: { careNeeds: true, remarks: true },
            },
          },
        ],
      }),
    );
    render(
      <MantineProvider>
        <SubformWorkspace />
      </MantineProvider>,
    );

    expect(
      await screen.findByText(
        'Only active subforms can be assigned to Per-SERV and Hybrid care plans.',
      ),
    ).toBeInTheDocument();
    await screen.findByText('Nursing visit');
    expect(screen.getByText('Duration (hours)')).toBeInTheDocument();
    expect(screen.getByText('Item list · 2 columns')).toBeInTheDocument();
    expect(screen.getByText('2 narrative sections')).toBeInTheDocument();
  });

  it('renders enabled subform components in the live preview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(
      <MantineProvider>
        <SubformWorkspace />
      </MantineProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Component preview' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Start time')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Item-list preview' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Schedule' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Item list' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Support Strategies' }));

    const preview = within(screen.getByTestId('subform-preview'));
    expect(preview.getByLabelText('Start time')).toBeInTheDocument();
    expect(preview.getByLabelText('End time')).toBeInTheDocument();
    expect(preview.getByRole('table', { name: 'Item-list preview' })).toHaveTextContent(
      'Item Category',
    );
    expect(preview.getByLabelText('Support Strategies')).toBeInTheDocument();
  });

  it('previews specialised health-summary inputs for selected general information', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /General Info/ }));
    expect(
      await screen.findByRole('heading', { name: 'Health Summary preview' }),
    ).toBeInTheDocument();

    const preview = within(screen.getByTestId('health-preview'));
    expect(preview.getByLabelText('Weight (kg)')).toHaveAttribute('type', 'number');
    expect(preview.getByLabelText('Height (cm)')).toHaveAttribute('type', 'number');
    expect(preview.getByLabelText('BMI')).toHaveAttribute('readonly');
    expect(preview.getByRole('table', { name: 'Allergy preview' })).toHaveTextContent('Allergen');
    expect(preview.getByRole('checkbox', { name: 'Regular diet' })).toBeInTheDocument();
    expect(preview.getByRole('combobox', { name: 'Fluid preference' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Teeth / Dentures' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vision / Glasses / Eyes' }));

    expect(preview.getByLabelText('Teeth')).toBeInTheDocument();
    expect(preview.getByLabelText('Dentures')).toBeInTheDocument();
    expect(preview.getByLabelText('Vision')).toBeInTheDocument();
    expect(preview.getByLabelText('Glasses')).toBeInTheDocument();
    expect(preview.getByLabelText('Eyes')).toBeInTheDocument();
  });

  it('shows only the active General Info tab in its matching preview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /General Info/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Support' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Communication Ability, Barriers & Aids' }),
    );

    const supportPreview = within(screen.getByTestId('support-preview'));
    expect(
      supportPreview.getByLabelText('Communication Ability, Barriers & Aids'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('health-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('emergency-preview')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Emergency' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Emergency Contacts' }));

    const emergencyPreview = within(screen.getByTestId('emergency-preview'));
    expect(emergencyPreview.getByLabelText('Emergency Contacts')).toBeInTheDocument();
    expect(screen.queryByTestId('support-preview')).not.toBeInTheDocument();
  });

  it('keeps Emergency Contacts as a required display field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(<MantineProvider><CarePlanWorkspace /></MantineProvider>);

    fireEvent.click(screen.getByRole('button', { name: /General Info/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Emergency' }));

    expect(screen.getByRole('checkbox', { name: 'Emergency Contacts' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Emergency Contacts' })).toBeDisabled();
    expect(within(screen.getByTestId('emergency-preview')).getByLabelText('Emergency Contacts')).toBeInTheDocument();
  });

  it('previews enabled shared SERV information components', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /SERV Info/ }));
    expect(await screen.findByRole('heading', { name: 'SERV Info preview' })).toBeInTheDocument();

    const preview = within(screen.getByTestId('serv-info-preview'));
    expect(preview.getByLabelText('Start time')).toBeInTheDocument();
    expect(preview.getByRole('table', { name: 'SERV item-list preview' })).toBeInTheDocument();
    expect(preview.getByLabelText('Care Needs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Outcome Reviews' }));
    expect(preview.getByLabelText('Outcome Reviews')).toBeInTheDocument();
  });

  it('limits consolidated SERV controls to checked services and shows disabled add actions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    render(
      <MantineProvider>
        <CarePlanWorkspace />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /SERV Config/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /DOM-01/ }));
    fireEvent.click(screen.getByRole('button', { name: /SERV Info/ }));

    const preview = within(screen.getByTestId('serv-info-preview'));
    expect(preview.getByRole('button', { name: 'Add session' })).toBeDisabled();
    expect(preview.getByRole('button', { name: 'Add item' })).toBeDisabled();
    const servSelectors = preview.getAllByRole('combobox', { name: 'SERV' });
    expect(servSelectors).toHaveLength(2);

    fireEvent.click(servSelectors[0]);
    expect(await screen.findByRole('option', { name: /DOM-01/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /PC-01/ })).not.toBeInTheDocument();
  });
});
