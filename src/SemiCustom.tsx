import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppShell,
  Autocomplete,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Grid,
  Group,
  JsonInput,
  Loader,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Switch,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import type {
  SemiCarePlanTemplate,
  SemiService,
  SemiSubformConfiguration,
  SemiSubformTemplate,
} from './domain/semiCustom';
import {
  createEmptySemiCarePlanResponseData,
  type SemiCarePlanResponse,
  type SemiCarePlanResponseData,
} from './domain/response';
import { notify } from './notifications';

const services: SemiService[] = [
  { category: 'Domestic Assistance', code: 'DOM-01', name: 'General Household Cleaning' },
  { category: 'Domestic Assistance', code: 'DOM-02', name: 'Laundry & Linen' },
  { category: 'Domestic Assistance', code: 'DOM-03', name: 'Meal Preparation' },
  { category: 'Personal Care', code: 'PC-01', name: 'Showering & Grooming Assistance' },
  { category: 'Personal Care', code: 'PC-02', name: 'Mobility Assistance' },
  { category: 'Personal Care', code: 'PC-03', name: 'Medication Prompting' },
  { category: 'Social Support & Community Access', code: 'SS-01', name: 'Community Access Outing' },
  { category: 'Social Support & Community Access', code: 'SS-02', name: 'In-Home Companionship' },
  { category: 'Nursing', code: 'NUR-01', name: 'Wound Care' },
  { category: 'Nursing', code: 'NUR-02', name: 'Clinical Health Monitoring' },
  { category: 'Respite Care', code: 'RES-01', name: 'Planned In-Home Respite' },
];

// These field catalogues define the choices available while authoring a care-plan template.
const participantFields = [
  'Full Legal Name & Preferred Name',
  'ACMPS Number / MAC ID',
  'Date of Birth & Age',
  'Residential Address',
  'Phone Number',
  'Care Partner(s)',
  'Funding Level',
];
const generalFields = {
  health: [
    'Weight / Height / BMI',
    'Teeth / Dentures',
    'Skin Condition',
    'Mobility',
    'Vision / Glasses / Eyes',
    'Hearing',
    'Continence',
    'Allergies, Diet & Fluids',
    'Cognitive',
    'Medical History',
    'Social History',
    'Personal Preferences',
    'Advanced Care Planning',
    'Living Arrangement',
    "Access to Participant's Home",
    'Remarks',
  ],
  support: [
    'Decision-Making Capacity',
    'Decision-Making Support Preferences',
    'Communication Ability, Barriers & Aids',
    'Communication Support Preferences',
    'Dignity of Risk',
    'Trauma Aware Care',
    'Diverse Identity',
    'Religion/Spiritual Beliefs',
  ],
  emergency: [
    'Emergency Contacts',
    'Mobility Aids',
    'Important Items to Take',
    'Call 000 in Emergencies',
    'Personal Alarm System',
    'Alternative Residency',
    'Remarks',
  ],
};
const requiredGeneralFields = {
  emergency: ['Emergency Contacts'],
};

function includeRequiredGeneralFields(general: Record<string, string[]>) {
  return {
    ...general,
    emergency: [...new Set([...requiredGeneralFields.emergency, ...(general.emergency ?? [])])],
  };
}
const sectionLabels: Record<string, string> = {
  careNeeds: 'Care Needs',
  participantGoals: 'Participant Goals',
  supportStrategies: 'Support Strategies',
  areasOfDifficulty: 'Areas of Difficulty and Existing Arrangements',
  sahRelevantInfo: 'Relevant Information on SAH Support Plan',
  remarks: 'Remarks',
  outcomeReviews: 'Outcome Reviews',
};
const workflowGuidance =
  'Create active subforms, choose a care-plan structure, select SERVs, assign subforms when required, then review and save.';
const subformSummary = (configuration: SemiSubformConfiguration) => [
  configuration.schedule
    ? configuration.schedule.timeFormat === 'duration'
      ? 'Duration (hours)'
      : 'Start–end time'
    : 'No schedule',
  configuration.itemList
    ? `Item list · ${configuration.itemList.columns.length} columns`
    : 'No item list',
  `${Object.values(configuration.sections ?? {}).filter(Boolean).length} narrative sections`,
];

function SubformPreview({
  name,
  schedule,
  timeFormat,
  itemList,
  columns,
  sections,
}: {
  name: string;
  schedule: boolean;
  timeFormat: 'start-end' | 'duration';
  itemList: boolean;
  columns: string[];
  sections: Record<string, boolean>;
}) {
  const enabledSections = Object.entries(sections).filter(([, enabled]) => enabled);
  return (
    <Paper p="md" withBorder className="subform-preview" data-testid="subform-preview">
      <Title order={4}>Component preview</Title>
      <Text size="sm" c="dimmed" mb="md">
        This is what staff will see when they fill the subform.
      </Text>
      <Paper p="sm" withBorder bg="gray.0">
        <Title order={5}>{name.trim() || 'Untitled subform'}</Title>
        <Stack mt="md" gap="md">
          {schedule && (
            <Box>
              <Text fw={600} size="sm" mb="xs">
                Schedule
              </Text>
              {timeFormat === 'duration' ? (
                <TextInput label="Duration (hours)" placeholder="e.g. 1.5" readOnly />
              ) : (
                <Group grow>
                  <TextInput label="Start time" placeholder="09:00" readOnly />
                  <TextInput label="End time" placeholder="10:00" readOnly />
                </Group>
              )}
              <Button mt="xs" size="xs" disabled>
                Add session
              </Button>
            </Box>
          )}
          {itemList && (
            <Box>
              <Text fw={600} size="sm" mb="xs">
                Item list
              </Text>
              <Box style={{ overflowX: 'auto' }}>
                <table
                  aria-label="Item-list preview"
                  style={{ borderCollapse: 'collapse', width: '100%' }}
                >
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column} style={{ textAlign: 'left', padding: '6px' }}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {columns.map((column) => (
                        <td key={column} style={{ padding: '6px' }}>
                          <TextInput
                            aria-label={`Preview ${column}`}
                            placeholder="Enter value"
                            readOnly
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </Box>
              <Button mt="xs" size="xs" disabled>
                Add item
              </Button>
            </Box>
          )}
          {enabledSections.map(([key]) => (
            <Textarea
              key={key}
              label={sectionLabels[key]}
              placeholder={`Enter ${sectionLabels[key].toLowerCase()}`}
              readOnly
            />
          ))}
          {!schedule && !itemList && !enabledSections.length && (
            <Text size="sm" c="dimmed">
              Enable a component to see it here.
            </Text>
          )}
        </Stack>
      </Paper>
    </Paper>
  );
}

function HealthMeasurementsPreview() {
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const bmi =
    Number(weight) > 0 && Number(height) > 0
      ? (Number(weight) / (Number(height) / 100) ** 2).toFixed(1)
      : '';
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }}>
      <TextInput
        label="Weight (kg)"
        type="number"
        value={weight}
        onChange={(event) => setWeight(event.currentTarget.value)}
      />
      <TextInput
        label="Height (cm)"
        type="number"
        value={height}
        onChange={(event) => setHeight(event.currentTarget.value)}
      />
      <TextInput label="BMI" value={bmi} readOnly />
    </SimpleGrid>
  );
}

function GeneralInfoPreview({
  title,
  fields,
  previewId,
}: {
  title: string;
  fields: string[];
  previewId: string;
}) {
  const previewField = (field: string) => {
    if (field === 'Weight / Height / BMI') return <HealthMeasurementsPreview key={field} />;
    if (field === 'Teeth / Dentures')
      return (
        <SimpleGrid key={field} cols={{ base: 1, sm: 2 }}>
          <TextInput label="Teeth" placeholder="Enter teeth details" readOnly />
          <TextInput label="Dentures" placeholder="Enter denture details" readOnly />
        </SimpleGrid>
      );
    if (field === 'Vision / Glasses / Eyes')
      return (
        <SimpleGrid key={field} cols={{ base: 1, sm: 3 }}>
          <TextInput label="Vision" readOnly />
          <TextInput label="Glasses" readOnly />
          <TextInput label="Eyes" readOnly />
        </SimpleGrid>
      );
    if (field === 'Allergies, Diet & Fluids')
      return (
        <Stack key={field}>
          <Box>
            <Text fw={600} size="sm" mb="xs">
              Allergies
            </Text>
            <Box style={{ overflowX: 'auto' }}>
              <table
                aria-label="Allergy preview"
                style={{ borderCollapse: 'collapse', width: '100%' }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Allergen</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Reaction</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px' }}>
                      <TextInput aria-label="Allergen" placeholder="Enter allergen" readOnly />
                    </td>
                    <td style={{ padding: '6px' }}>
                      <TextInput aria-label="Reaction" placeholder="Enter reaction" readOnly />
                    </td>
                  </tr>
                </tbody>
              </table>
            </Box>
          </Box>
          <Checkbox.Group label="Diet" value={[]} readOnly>
            <Group mt="xs">
              <Checkbox value="regular" label="Regular diet" readOnly />
              <Checkbox value="soft" label="Soft diet" readOnly />
              <Checkbox value="texture-modified" label="Texture-modified diet" readOnly />
            </Group>
          </Checkbox.Group>
          <Select
            label="Fluid preference"
            data={['No preference', 'Standard fluids', 'Thickened fluids']}
            readOnly
          />
        </Stack>
      );
    return (
      <Textarea key={field} label={field} placeholder={`Enter ${field.toLowerCase()}`} readOnly />
    );
  };
  return (
    <Paper p="md" withBorder data-testid={previewId}>
      <Title order={4}>{title} preview</Title>
      <Text size="sm" c="dimmed" mb="md">
        Selected fields appear as staff-facing form components.
      </Text>
      <Stack>{fields.map(previewField)}</Stack>
    </Paper>
  );
}

function ServInfoPreview({
  configuration,
  selectedServices,
}: {
  configuration: Record<string, boolean>;
  selectedServices: SemiService[];
}) {
  const serviceOptions = selectedServices.map((service) => `${service.code} · ${service.name}`);
  const serviceProps = {
    data: serviceOptions,
    placeholder: selectedServices.length
      ? 'Select checked SERV'
      : 'Select SERVs in SERV Config first',
    disabled: !selectedServices.length,
  };
  return (
    <Paper p="md" withBorder data-testid="serv-info-preview">
      <Title order={4}>SERV Info preview</Title>
      <Text size="sm" c="dimmed" mb="md">
        This shared content will appear for every selected service.
      </Text>
      <Stack>
        {configuration.schedule && (
          <Box>
            <Text fw={600} size="sm" mb="xs">
              Schedule
            </Text>
            <Autocomplete label="SERV" {...serviceProps} />
            <Group grow mt="xs">
              <TextInput label="Start time" placeholder="09:00" readOnly />
              <TextInput label="End time" placeholder="10:00" readOnly />
            </Group>
            <Button size="xs" variant="light" disabled mt="xs">
              Add session
            </Button>
          </Box>
        )}
        {configuration.itemList && (
          <Box>
            <Text fw={600} size="sm" mb="xs">
              Item list
            </Text>
            <table
              aria-label="SERV item-list preview"
              style={{ borderCollapse: 'collapse', width: '100%' }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px' }}>SERV</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Service detail</th>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Frequency</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '6px' }}>
                    <Autocomplete aria-label="SERV" {...serviceProps} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput aria-label="Service detail" readOnly />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <TextInput aria-label="Frequency" readOnly />
                  </td>
                </tr>
              </tbody>
            </table>
            <Button size="xs" variant="light" disabled mt="xs">
              Add item
            </Button>
          </Box>
        )}
        {Object.entries(sectionLabels)
          .filter(([key]) => configuration[key])
          .map(([key, label]) => (
            <Textarea
              key={key}
              label={label}
              placeholder={`Enter ${label.toLowerCase()}`}
              readOnly
            />
          ))}
      </Stack>
    </Paper>
  );
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok)
    throw new Error((await response.json().catch(() => ({}))).error ?? 'Request failed');
  return response.json() as Promise<T>;
}
const navigate = (path: string) => {
  window.location.href = path;
};

export function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const path = location.pathname;
  return (
    <AppShell padding="lg" navbar={{ width: 245, breakpoint: 'sm' }}>
      <AppShell.Navbar p="md">
        <Title order={3}>Form Foundry</Title>
        <Text size="sm" c="dimmed" mb="lg">
          Form template workspace
        </Text>
        <Stack gap="xs">
          <Button variant={path === '/' ? 'filled' : 'light'} onClick={() => navigate('/')}>
            Home
          </Button>
          <Text size="xs" fw={700} c="dimmed" mt="sm">
            FULL-CUSTOM
          </Text>
          <Button
            variant={path.startsWith('/full-custom') ? 'filled' : 'light'}
            onClick={() => navigate('/full-custom')}
          >
            Full-custom templates
          </Button>
          <Text size="xs" fw={700} c="dimmed" mt="sm">
            SEMI-CUSTOM
          </Text>
          <Button
            variant={path === '/semi/subform' ? 'filled' : 'light'}
            onClick={() => navigate('/semi/subform')}
          >
            Subform templates
          </Button>
          <Button
            variant={path.startsWith('/semi/care-plan') ? 'filled' : 'light'}
            onClick={() => navigate('/semi/care-plan')}
          >
            Care-plan templates
          </Button>
          <Text size="xs" fw={700} c="dimmed" mt="sm">
            RECORDS
          </Text>
          <Button
            variant={path === '/responses' ? 'filled' : 'light'}
            onClick={() => navigate('/responses')}
          >
            Saved responses
          </Button>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <Group justify="space-between" mb="lg">
          <Box>
            <Title order={2}>{title}</Title>
            <Text c="dimmed">Support at Home service-template workspace</Text>
          </Box>
          <Badge color="violet">semi-custom</Badge>
        </Group>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}

export function Landing() {
  return (
    <Box maw={760} mx="auto" p="xl">
      <Title order={1}>Choose a form-authoring approach</Title>
      <Text c="dimmed" mb="xl">
        Build fully flexible JSON-schema forms, or compose a structured Support at Home care plan
        from reusable subforms.
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Paper p="xl" withBorder>
          <Title order={3}>Full-custom</Title>
          <Text mb="md">Use the field canvas, layouts, tabs, and conditional logic.</Text>
          <Button onClick={() => navigate('/full-custom')}>Open full-custom builder</Button>
        </Paper>
        <Paper p="xl" withBorder>
          <Title order={3}>Semi-custom</Title>
          <Text mb="md">
            Manage SERV subforms separately, then create a care plan from active templates.
          </Text>
          <Group>
            <Button onClick={() => navigate('/semi/subform')}>Manage subforms</Button>
            <Button variant="light" onClick={() => navigate('/semi/care-plan')}>
              Create care plan
            </Button>
          </Group>
        </Paper>
      </SimpleGrid>
    </Box>
  );
}

export function SubformWorkspace() {
  const [templates, setTemplates] = useState<SemiSubformTemplate[]>([]);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [schedule, setSchedule] = useState(false);
  const [timeFormat, setTimeFormat] = useState<'start-end' | 'duration'>('start-end');
  const [itemList, setItemList] = useState(false);
  const [columns, setColumns] = useState<string[]>(['Item Category', 'Description', 'Frequency']);
  const [sections, setSections] = useState<Record<string, boolean>>({
    careNeeds: true,
    participantGoals: true,
    remarks: true,
  });
  const refresh = () =>
    api<SemiSubformTemplate[]>('/api/semi/subforms')
      .then(setTemplates)
      .catch((error) => notify.error(error.message));
  useEffect(() => {
    void refresh();
  }, []);
  const save = async () => {
    if (!name.trim()) return notify.warning('A subform name is required.');
    const configuration: SemiSubformConfiguration = {
      ...(schedule ? { schedule: { timeFormat } } : {}),
      ...(itemList ? { itemList: { columns } } : {}),
      sections,
    };
    try {
      await api('/api/semi/subforms', {
        method: 'POST',
        body: JSON.stringify({ name, active, configuration }),
      });
      setName('');
      setSchedule(false);
      setItemList(false);
      setSections({ careNeeds: true, participantGoals: true, remarks: true });
      notify.success('Subform template saved.');
      refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Could not save subform.');
    }
  };
  const toggle = async (template: SemiSubformTemplate) => {
    try {
      await api(`/api/semi/subforms/${template.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !template.active }),
      });
      refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Could not update subform.');
    }
  };
  return (
    <Shell title="SERV subform templates">
      <Alert color="blue" title="Authoring workflow" mb="lg">
        {workflowGuidance}
      </Alert>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Paper p="md" withBorder>
            <Title order={4}>Create subform template</Title>
            <TextInput
              label="Template name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="Nursing – Wound Care"
              mt="md"
            />
            <Switch
              label="Active for care-plan assignment"
              checked={active}
              onChange={(event) => setActive(event.currentTarget.checked)}
              mt="md"
            />
            <Text size="xs" c="dimmed" mt={4}>
              Only active subforms can be assigned to Per-SERV and Hybrid care plans.
            </Text>
            <Checkbox
              label="Schedule"
              checked={schedule}
              onChange={(event) => setSchedule(event.currentTarget.checked)}
              mt="md"
            />
            {schedule && (
              <Select
                label="Time format"
                data={[
                  { value: 'start-end', label: 'Start–end time' },
                  { value: 'duration', label: 'Duration (hours)' },
                ]}
                value={timeFormat}
                onChange={(value) => setTimeFormat(value as 'start-end' | 'duration')}
                mt="xs"
              />
            )}
            <Checkbox
              label="Item list"
              checked={itemList}
              onChange={(event) => setItemList(event.currentTarget.checked)}
              mt="md"
            />
            {itemList && (
              <Checkbox.Group
                label="Item-list columns"
                value={columns}
                onChange={setColumns}
                mt="xs"
              >
                <Group mt="xs">
                  {['Item Category', 'Description', 'Amount', 'Unit Type', 'Frequency'].map(
                    (column) => (
                      <Checkbox key={column} value={column} label={column} />
                    ),
                  )}
                </Group>
              </Checkbox.Group>
            )}
            <Divider my="md" />
            <Text fw={600}>Narrative sections</Text>
            <Stack gap="xs" mt="xs">
              {Object.entries(sectionLabels).map(([key, label]) => (
                <Checkbox
                  key={key}
                  label={label}
                  checked={Boolean(sections[key])}
                  onChange={(event) =>
                    setSections({ ...sections, [key]: event.currentTarget.checked })
                  }
                />
              ))}
            </Stack>
            <Button mt="lg" onClick={() => void save()}>
              Save subform
            </Button>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack className="subform-side-panel">
            <SubformPreview
              name={name}
              schedule={schedule}
              timeFormat={timeFormat}
              itemList={itemList}
              columns={columns}
              sections={sections}
            />
            <Paper p="md" withBorder>
              <Group justify="space-between">
                <Title order={4}>Template library</Title>
                <Badge>{templates.length}</Badge>
              </Group>
              <Stack mt="md">
                {templates.map((template) => (
                  <Paper key={template.id} p="sm" withBorder>
                    <Group justify="space-between">
                      <Box>
                        <Text fw={600}>{template.name}</Text>
                        <Text size="xs" c="dimmed">
                          {template.createdAt?.slice(0, 10)}
                        </Text>
                        <Group gap="xs" mt="xs">
                          {subformSummary(template.configuration).map((item) => (
                            <Badge key={item} variant="light">
                              {item}
                            </Badge>
                          ))}
                        </Group>
                      </Box>
                      <Switch
                        label="Active"
                        checked={template.active}
                        onChange={() => void toggle(template)}
                      />
                    </Group>
                  </Paper>
                ))}
                {!templates.length && (
                  <Text c="dimmed">Create a reusable subform template to begin.</Text>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Shell>
  );
}

export function CarePlanLibrary() {
  const [plans, setPlans] = useState<SemiCarePlanTemplate[]>([]);
  useEffect(() => {
    api<SemiCarePlanTemplate[]>('/api/semi/care-plans')
      .then(setPlans)
      .catch((error) => notify.error(error.message));
  }, []);
  const fill = async (plan: SemiCarePlanTemplate) => {
    try {
      const response = await api<SemiCarePlanResponse>('/api/responses', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'semi-care-plan',
          templateId: plan.id,
          formData: createEmptySemiCarePlanResponseData(plan),
        }),
      });
      navigate(`/semi/care-plan/response/${response.id}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Could not create response.');
    }
  };
  return (
    <Shell title="Care-plan templates">
      <Group justify="space-between" mb="lg">
        <Text c="dimmed">
          Create structured templates, then fill them as saved care-plan responses.
        </Text>
        <Button onClick={() => navigate('/semi/care-plan/new')}>New care-plan template</Button>
      </Group>
      <Stack>
        {plans.map((plan) => (
          <Paper key={plan.id} p="md" withBorder>
            <Group justify="space-between">
              <Box>
                <Text fw={700}>{plan.name}</Text>
                <Text size="sm" c="dimmed">
                  {plan.structure} · {plan.services.length} SERVs
                </Text>
              </Box>
              <Group>
                <Button
                  component="a"
                  href={`/api/semi/care-plans/${plan.id}/html`}
                  target="_blank"
                  variant="light"
                >
                  View
                </Button>
                <Button
                  variant="default"
                  onClick={() => navigate(`/semi/care-plan/edit/${plan.id}`)}
                >
                  Edit
                </Button>
                <Button onClick={() => void fill(plan)}>Fill</Button>
              </Group>
            </Group>
          </Paper>
        ))}
        {!plans.length && (
          <Paper p="xl" withBorder>
            <Text c="dimmed">No care-plan templates yet.</Text>
          </Paper>
        )}
      </Stack>
    </Shell>
  );
}

function CarePlanResponseEditor({ responseId }: { responseId: string }) {
  const [response, setResponse] = useState<SemiCarePlanResponse>();
  const [formData, setFormData] = useState<SemiCarePlanResponseData>();
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    api<SemiCarePlanResponse>(`/api/responses/${responseId}`)
      .then((saved) => {
        setResponse(saved);
        setFormData(saved.formData);
      })
      .catch((error) => setMessage(error.message));
  }, [responseId]);
  if (!response || !formData)
    return (
      <Shell title="Care-plan response">
        {message ? <Alert color="red">{message}</Alert> : <Loader />}
      </Shell>
    );
  const updateService = (
    code: string,
    change: Partial<SemiCarePlanResponseData['services'][string]>,
  ) =>
    setFormData({
      ...formData,
      services: { ...formData.services, [code]: { ...formData.services[code], ...change } },
    });
  const save = async () => {
    try {
      const saved = await api<SemiCarePlanResponse>(`/api/responses/${response.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ formData }),
      });
      setResponse(saved);
      setFormData(saved.formData);
      notify.success('Saved response updated.');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Could not save response.');
    }
  };
  const template = response.templateSnapshot;
  return (
    <Shell title={`Fill ${template.name}`}>
      <Stack>
        <Group justify="space-between">
          <Text c="dimmed">This response remains linked to its saved template snapshot.</Text>
          <Group>
            <Button
              component="a"
              href={`/api/responses/${response.id}/html`}
              target="_blank"
              variant="light"
            >
              View HTML
            </Button>
            <Button onClick={() => void save()}>Save response</Button>
          </Group>
        </Group>
        <Paper p="lg" withBorder>
          <Title order={3}>Participant details</Title>
          {Object.keys(formData.participant).map((field) => (
            <TextInput
              key={field}
              label={field}
              value={formData.participant[field]}
              onChange={(event) =>
                setFormData({
                  ...formData,
                  participant: { ...formData.participant, [field]: event.currentTarget.value },
                })
              }
              mt="sm"
            />
          ))}
        </Paper>
        {Object.entries(formData.generalInfo).map(([group, fields]) => (
          <Paper key={group} p="lg" withBorder>
            <Title order={3}>{group}</Title>
            {Object.keys(fields).map((field) => (
              <Textarea
                key={field}
                label={field}
                value={fields[field]}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    generalInfo: {
                      ...formData.generalInfo,
                      [group]: { ...fields, [field]: event.currentTarget.value },
                    },
                  })
                }
                mt="sm"
              />
            ))}
          </Paper>
        ))}
        {Object.keys(formData.servInfo).length > 0 && (
          <Paper p="lg" withBorder>
            <Title order={3}>Shared SERV information</Title>
            {Object.keys(formData.servInfo).map((field) => (
              <Textarea
                key={field}
                label={sectionLabels[field] ?? field}
                value={formData.servInfo[field]}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    servInfo: { ...formData.servInfo, [field]: event.currentTarget.value },
                  })
                }
                mt="sm"
              />
            ))}
          </Paper>
        )}
        {template.services.map((service) => {
          const serviceData = formData.services[service.code] ?? {};
          return (
            <Paper key={service.code} p="lg" withBorder>
              <Title order={3}>
                {service.code} · {service.name}
              </Title>
              {serviceData.schedule && (
                <Group grow mt="sm">
                  {Object.keys(serviceData.schedule).map((key) => (
                    <TextInput
                      key={key}
                      label={key}
                      value={serviceData.schedule?.[key] ?? ''}
                      onChange={(event) =>
                        updateService(service.code, {
                          schedule: { ...serviceData.schedule, [key]: event.currentTarget.value },
                        })
                      }
                    />
                  ))}
                </Group>
              )}
              {serviceData.sections &&
                Object.keys(serviceData.sections).map((section) => (
                  <Textarea
                    key={section}
                    label={sectionLabels[section] ?? section}
                    value={serviceData.sections?.[section] ?? ''}
                    onChange={(event) =>
                      updateService(service.code, {
                        sections: { ...serviceData.sections, [section]: event.currentTarget.value },
                      })
                    }
                    mt="sm"
                  />
                ))}
              {serviceData.itemList && (
                <Stack mt="md">
                  <Text fw={600}>Item list</Text>
                  <table>
                    <thead>
                      <tr>
                        {Object.keys(serviceData.itemList[0] ?? {}).map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {serviceData.itemList.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {Object.keys(row).map((column) => (
                            <td key={column}>
                              <TextInput
                                aria-label={`${service.code} ${column}`}
                                value={row[column]}
                                onChange={(event) =>
                                  updateService(service.code, {
                                    itemList: serviceData.itemList?.map((current, index) =>
                                      index === rowIndex
                                        ? { ...current, [column]: event.currentTarget.value }
                                        : current,
                                    ),
                                  })
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => {
                      const columns = Object.keys(serviceData.itemList?.[0] ?? {});
                      updateService(service.code, {
                        itemList: [
                          ...(serviceData.itemList ?? []),
                          Object.fromEntries(columns.map((column) => [column, ''])),
                        ],
                      });
                    }}
                  >
                    Add item-list row for {service.code}
                  </Button>
                </Stack>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Shell>
  );
}

export function CarePlanWorkspace() {
  const responseId = location.pathname.match(/^\/semi\/care-plan\/response\/([^/]+)$/)?.[1];
  if (responseId) return <CarePlanResponseEditor responseId={responseId} />;
  const editId = location.pathname.match(/^\/semi\/care-plan\/edit\/([^/]+)$/)?.[1];
  const [subforms, setSubforms] = useState<SemiSubformTemplate[]>([]);
  const [name, setName] = useState('Untitled Support at Home plan');
  const [structure, setStructure] = useState<SemiCarePlanTemplate['structure']>('consolidated');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [participant, setParticipant] = useState<string[]>(['Full Legal Name & Preferred Name']);
  const [general, setGeneral] = useState<Record<string, string[]>>({
    health: ['Weight / Height / BMI', 'Mobility', 'Allergies, Diet & Fluids'],
    support: [],
    emergency: requiredGeneralFields.emergency,
  });
  const [generalTab, setGeneralTab] = useState<keyof typeof generalFields>('health');
  const [servInfo, setServInfo] = useState<Record<string, boolean>>({
    schedule: true,
    itemList: true,
    careNeeds: true,
    participantGoals: true,
    remarks: true,
  });
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [activeStep, setActiveStep] = useState('structure');
  const [category, setCategory] = useState<string | null>(null);
  const [jsonOpened, setJsonOpened] = useState(false);
  const [previewServiceCode, setPreviewServiceCode] = useState<string>();

  useEffect(() => {
    api<SemiSubformTemplate[]>('/api/semi/subforms?active=true')
      .then(setSubforms)
      .catch((error) => notify.error(error.message));
    if (editId)
      api<SemiCarePlanTemplate>(`/api/semi/care-plans/${editId}`)
        .then((plan) => {
          setName(plan.name);
          setStructure(plan.structure);
          setSelectedCodes(plan.services.map((service) => service.code));
          setParticipant(plan.participantFields ?? []);
          setGeneral(includeRequiredGeneralFields(plan.generalInfo ?? {}));
          setServInfo((plan.servInfo ?? {}) as Record<string, boolean>);
          setAssigned(
            Object.fromEntries(
              (plan.assignments ?? []).map((assignment) => [
                assignment.serviceCode,
                assignment.subform.id,
              ]),
            ),
          );
        })
        .catch((error) => notify.error(error.message));
  }, [editId]);

  const selectedServices = services.filter((service) => selectedCodes.includes(service.code));
  const visibleServices = category
    ? services.filter((service) => service.category === category)
    : services;
  const needsAssignments = structure !== 'consolidated';
  const hasServInfo = structure !== 'per-serv';
  const activeSubformAvailability = subforms.length
    ? `${subforms.length} active subform${subforms.length === 1 ? '' : 's'} available for assignment.`
    : 'No active subforms are available for assignment.';
  const previewService = selectedServices.find((service) => service.code === previewServiceCode);
  const previewSubform = subforms.find(
    (template) => template.id === assigned[previewServiceCode ?? ''],
  );
  const assignedCount = selectedServices.filter((service) =>
    Boolean(assigned[service.code]),
  ).length;
  const categories = [...new Set(services.map((service) => service.category))];
  const steps = [
    { key: 'structure', label: 'Template Structure', description: 'Pick a structure' },
    { key: 'services', label: 'SERV Config', description: 'Choose services' },
    { key: 'participant', label: 'Participant Details', description: 'Choose fields' },
    { key: 'general', label: 'General Info', description: 'Health & support fields' },
    ...(hasServInfo
      ? [{ key: 'serv-info', label: 'SERV Info', description: 'Consolidated content' }]
      : []),
    ...(needsAssignments
      ? [{ key: 'assignment', label: 'SERV Assignment', description: 'Link subform templates' }]
      : []),
    { key: 'summary', label: 'Review & save', description: 'Check and save' },
  ];
  const currentStep = Math.max(
    0,
    steps.findIndex((step) => step.key === activeStep),
  );
  const currentKey = steps[currentStep].key;
  const isSummary = currentKey === 'summary';

  // Store a complete subform snapshot in the plan so later edits to a library template do not
  // change an already-authored care plan.
  const carePlan = useMemo<SemiCarePlanTemplate>(
    () => ({
      ...(editId ? { id: editId } : {}),
      name,
      structure,
      services: selectedServices,
      participantFields: participant,
      generalInfo: includeRequiredGeneralFields(general),
      ...(hasServInfo ? { servInfo } : {}),
      ...(needsAssignments
        ? {
            assignments: selectedServices.flatMap((service) => {
              const subform = subforms.find((template) => template.id === assigned[service.code]);
              return subform
                ? [
                    {
                      serviceCode: service.code,
                      subform: {
                        id: subform.id!,
                        name: subform.name,
                        configuration: subform.configuration,
                      },
                    },
                  ]
                : [];
            }),
          }
        : {}),
    }),
    [
      name,
      structure,
      selectedServices,
      participant,
      general,
      hasServInfo,
      servInfo,
      needsAssignments,
      subforms,
      assigned,
    ],
  );

  const chooseStructure = (value: SemiCarePlanTemplate['structure']) => {
    setStructure(value);
    setActiveStep('structure');
  };
  const save = async () => {
    if (needsAssignments && selectedServices.some((service) => !assigned[service.code]))
      return notify.warning('Assign an active subform to every selected SERV.');
    try {
      const saved = await api<SemiCarePlanTemplate>('/api/semi/care-plans', {
        method: 'POST',
        body: JSON.stringify(carePlan),
      });
      notify.success(`Saved “${saved.name}” as self-contained JSON.`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Could not save care plan.');
    }
  };
  const structureOptions = [
    {
      value: 'per-serv' as const,
      label: 'Per-SERV',
      description: 'Service content and scheduling live in each assigned subform.',
      workflow: ['SERV Config', 'Participant Details', 'General Info', 'SERV Assignment'],
    },
    {
      value: 'consolidated' as const,
      label: 'Consolidated',
      description: 'One shared SERV Info section covers all selected services.',
      workflow: ['SERV Config', 'Participant Details', 'General Info', 'SERV Info'],
    },
    {
      value: 'hybrid' as const,
      label: 'Hybrid',
      description: 'Shared SERV Info plus content from assigned service subforms.',
      workflow: [
        'SERV Config',
        'Participant Details',
        'General Info',
        'SERV Info',
        'SERV Assignment',
      ],
    },
  ];

  // Each key matches a step key, keeping the stepper configuration and editor content aligned.
  const content = {
    structure: (
      <Stack>
        <Title order={3}>Template Structure</Title>
        <Text c="dimmed">
          Choose how this service template is organised. The structure controls which authoring
          steps apply.
        </Text>
        <TextInput
          label="Care-plan name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          {structureOptions.map((option) => {
            const selected = structure === option.value;
            return (
              <Paper
                key={option.value}
                role="radio"
                aria-checked={selected}
                tabIndex={0}
                p="md"
                withBorder
                bg={selected ? 'violet.0' : undefined}
                style={{
                  borderColor: selected ? 'var(--mantine-color-violet-filled)' : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => chooseStructure(option.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') chooseStructure(option.value);
                }}
              >
                <Group gap="xs" align="center">
                  <Box
                    w={16}
                    h={16}
                    style={{
                      border: `2px solid ${selected ? 'var(--mantine-color-violet-filled)' : 'var(--mantine-color-gray-5)'}`,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {selected && <Box w={8} h={8} bg="violet.6" style={{ borderRadius: '50%' }} />}
                  </Box>
                  <Title order={4}>{option.label}</Title>
                </Group>
                <Text size="sm" c="dimmed" mt="xs" mb="md">
                  {option.description}
                </Text>
                <Stack gap={0}>
                  {option.workflow.map((step, index) => (
                    <Box key={step}>
                      <Paper
                        data-testid="workflow-chip"
                        p="xs"
                        withBorder
                        radius="sm"
                        bg={selected ? 'white' : 'gray.0'}
                      >
                        <Text size="xs" fw={600} ta="center">
                          {step}
                        </Text>
                      </Paper>
                      {index < option.workflow.length - 1 && (
                        <Box h={14} w={2} bg="gray.4" mx="auto" />
                      )}
                    </Box>
                  ))}
                </Stack>
              </Paper>
            );
          })}
        </SimpleGrid>
        {needsAssignments && (
          <Text size="sm" c="violet.8" fw={500}>
            {`Please review the available SERV subforms before continuing. ${activeSubformAvailability}`}
          </Text>
        )}
      </Stack>
    ),
    services: (
      <Stack>
        <Title order={3}>SERV Configuration</Title>
        <Text c="dimmed">
          Select the services this template covers. Selections determine the assignment rows when
          required.
        </Text>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {selectedCodes.length} of {services.length} SERVs selected
          </Text>
          <Group gap="xs">
            <Button
              variant="light"
              size="xs"
              onClick={() => setSelectedCodes(services.map((service) => service.code))}
            >
              Check all SERVs
            </Button>
            <Button variant="default" size="xs" onClick={() => setSelectedCodes([])}>
              Uncheck all SERVs
            </Button>
          </Group>
        </Group>
        <Select
          label="SERV category"
          placeholder="All categories"
          clearable
          data={categories}
          value={category}
          onChange={setCategory}
        />
        <Box style={{ overflowX: 'auto' }}>
          <table
            aria-label="SERV configuration"
            style={{ borderCollapse: 'collapse', width: '100%' }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px', width: '72px' }}>Selected</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>SERV code</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Service</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Category</th>
              </tr>
            </thead>
            <tbody>
              {visibleServices.map((service) => (
                <tr key={service.code}>
                  <td style={{ padding: '8px' }}>
                    <Checkbox
                      aria-label={`Select ${service.code}`}
                      checked={selectedCodes.includes(service.code)}
                      onChange={(event) =>
                        setSelectedCodes(
                          event.currentTarget.checked
                            ? [...selectedCodes, service.code]
                            : selectedCodes.filter((code) => code !== service.code),
                        )
                      }
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <Text size="sm" fw={600}>
                      {service.code}
                    </Text>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <Text size="sm">{service.name}</Text>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <Text size="sm" c="dimmed">
                      {service.category}
                    </Text>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Stack>
    ),
    participant: (
      <Stack>
        <Title order={3}>Participant Details</Title>
        <Text c="dimmed">Select displayed information</Text>
        <Checkbox.Group value={participant} onChange={setParticipant}>
          <Stack>
            {participantFields.map((field) => (
              <Checkbox
                key={field}
                value={field}
                label={field}
                disabled={field === 'Full Legal Name & Preferred Name'}
              />
            ))}
          </Stack>
        </Checkbox.Group>
      </Stack>
    ),
    general: (
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Stack>
            <Title order={3}>General Info</Title>
            <Tabs
              value={generalTab}
              onChange={(value) => setGeneralTab(value as keyof typeof generalFields)}
            >
              <Tabs.List>
                <Tabs.Tab value="health">Health Summary</Tabs.Tab>
                <Tabs.Tab value="support">Support</Tabs.Tab>
                <Tabs.Tab value="emergency">Emergency</Tabs.Tab>
              </Tabs.List>
              {Object.entries(generalFields).map(([key, fields]) => (
                <Tabs.Panel key={key} value={key} pt="sm">
                  <Checkbox.Group
                    value={general[key] ?? []}
                    onChange={(values) =>
                      setGeneral(includeRequiredGeneralFields({ ...general, [key]: values }))
                    }
                  >
                    <Stack>
                      {fields.map((field) => (
                        <Checkbox
                          key={field}
                          value={field}
                          label={field}
                          disabled={field === 'Emergency Contacts'}
                        />
                      ))}
                    </Stack>
                  </Checkbox.Group>
                </Tabs.Panel>
              ))}
            </Tabs>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <GeneralInfoPreview
            title={
              generalTab === 'health'
                ? 'Health Summary'
                : generalTab === 'support'
                  ? 'Support'
                  : 'Emergency'
            }
            fields={general[generalTab] ?? []}
            previewId={`${generalTab}-preview`}
          />
        </Grid.Col>
      </Grid>
    ),
    'serv-info': (
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Stack>
            <Title order={3}>SERV Info</Title>
            <Text c="dimmed">Configure shared content that applies to every selected service.</Text>
            {Object.entries(sectionLabels).map(([key, label]) => (
              <Checkbox
                key={key}
                label={label}
                checked={Boolean(servInfo[key])}
                onChange={(event) =>
                  setServInfo({ ...servInfo, [key]: event.currentTarget.checked })
                }
              />
            ))}
            <Checkbox
              label="Consolidated schedule"
              checked={Boolean(servInfo.schedule)}
              onChange={(event) =>
                setServInfo({ ...servInfo, schedule: event.currentTarget.checked })
              }
            />
            <Checkbox
              label="Consolidated item list"
              checked={Boolean(servInfo.itemList)}
              onChange={(event) =>
                setServInfo({ ...servInfo, itemList: event.currentTarget.checked })
              }
            />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <ServInfoPreview configuration={servInfo} selectedServices={selectedServices} />
        </Grid.Col>
      </Grid>
    ),
    assignment: (
      <Stack>
        <Title order={3}>SERV Assignment</Title>
        <Text c="dimmed">Assign an active reusable subform to each selected service.</Text>
        <Text size="sm" fw={600}>
          {assignedCount} of {selectedServices.length} selected SERVs assigned
        </Text>
        {!subforms.length && (
          <Alert color="yellow">
            No active subforms. Create or activate one in the subform workspace.
          </Alert>
        )}
        <Stack>
          {selectedServices.map((service) => (
            <Group key={service.code} align="end" wrap="nowrap">
              <Select
                flex={1}
                label={`${service.code} · ${service.name}`}
                placeholder="Select active subform"
                data={subforms.map((template) => ({ value: template.id!, label: template.name }))}
                value={assigned[service.code] ?? null}
                onChange={(value) => setAssigned({ ...assigned, [service.code]: value ?? '' })}
              />
              <Button
                variant="light"
                disabled={!assigned[service.code]}
                aria-label={`Preview subform for ${service.code}`}
                onClick={() => setPreviewServiceCode(service.code)}
              >
                Preview
              </Button>
            </Group>
          ))}
          {!selectedServices.length && (
            <Text c="dimmed">
              No SERVs selected yet — return to SERV Config to choose services.
            </Text>
          )}
        </Stack>
      </Stack>
    ),
    summary: (
      <Stack>
        <Group justify="space-between">
          <Box>
            <Title order={3}>Review &amp; save</Title>
            <Text c="dimmed">Review the self-contained configuration before saving.</Text>
          </Box>
          <Button onClick={() => void save()}>Save care plan</Button>
        </Group>
        <Alert
          color={needsAssignments && assignedCount !== selectedServices.length ? 'yellow' : 'blue'}
        >
          {selectedServices.length} SERVs selected
          {needsAssignments ? ` · ${assignedCount} assigned` : ' · no subform assignments required'}
        </Alert>
        <Button variant="light" onClick={() => setJsonOpened((opened) => !opened)}>
          {jsonOpened ? 'Hide configuration JSON' : 'View configuration JSON'}
        </Button>
        {jsonOpened && (
          <JsonInput
            value={JSON.stringify(carePlan, null, 2)}
            formatOnBlur
            autosize
            minRows={22}
            readOnly
          />
        )}
      </Stack>
    ),
  } as const;

  return (
    <Shell title="Semi-custom care-plan template">
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, lg: 3 }}>
          <Stepper
            active={currentStep}
            orientation="vertical"
            onStepClick={(step) => setActiveStep(steps[step].key)}
          >
            {steps.map((step) => (
              <Stepper.Step key={step.key} label={step.label} description={step.description} />
            ))}
          </Stepper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 9 }}>
          <Stack>
            <Paper p="lg" withBorder>
              {content[currentKey as keyof typeof content]}
            </Paper>
            <Group justify="space-between">
              <Button
                variant="default"
                disabled={currentStep === 0}
                onClick={() => setActiveStep(steps[currentStep - 1].key)}
              >
                Back
              </Button>
              {!isSummary && (
                <Button onClick={() => setActiveStep(steps[currentStep + 1].key)}>Next</Button>
              )}
            </Group>
          </Stack>
        </Grid.Col>
      </Grid>
      <Modal
        opened={Boolean(previewService && previewSubform)}
        onClose={() => setPreviewServiceCode(undefined)}
        title="Subform preview"
        size="lg"
      >
        {previewService && previewSubform && (
          <SubformPreview
            name={`${previewService.code} · ${previewService.name}`}
            schedule={Boolean(previewSubform.configuration.schedule)}
            timeFormat={previewSubform.configuration.schedule?.timeFormat ?? 'start-end'}
            itemList={Boolean(previewSubform.configuration.itemList)}
            columns={previewSubform.configuration.itemList?.columns ?? []}
            sections={previewSubform.configuration.sections ?? {}}
          />
        )}
      </Modal>
    </Shell>
  );
}
