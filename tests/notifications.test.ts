import { describe, expect, it, vi } from 'vitest';

const { show } = vi.hoisted(() => ({ show: vi.fn() }));

vi.mock('@mantine/notifications', () => ({
  notifications: { show },
}));

import { notify } from '../src/notifications';

describe('notify', () => {
  it('shows dismissible success, warning, and error toasts with their configured durations', () => {
    notify.success('Template saved');
    notify.warning('Save the template first');
    notify.error('Could not save template');

    expect(show).toHaveBeenNthCalledWith(1, {
      message: 'Template saved',
      color: 'green',
      autoClose: 4_000,
      withCloseButton: true,
    });
    expect(show).toHaveBeenNthCalledWith(2, {
      message: 'Save the template first',
      color: 'yellow',
      autoClose: 7_000,
      withCloseButton: true,
    });
    expect(show).toHaveBeenNthCalledWith(3, {
      message: 'Could not save template',
      color: 'red',
      autoClose: 7_000,
      withCloseButton: true,
    });
  });
});
