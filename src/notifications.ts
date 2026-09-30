import { notifications } from '@mantine/notifications';

type NotificationKind = 'success' | 'warning' | 'error';

const options: Record<NotificationKind, { color: string; autoClose: number }> = {
  success: { color: 'green', autoClose: 4_000 },
  warning: { color: 'yellow', autoClose: 7_000 },
  error: { color: 'red', autoClose: 7_000 },
};

const show = (kind: NotificationKind, message: string) =>
  notifications.show({
    message,
    ...options[kind],
    withCloseButton: true,
  });

export const notify = {
  success: (message: string) => show('success', message),
  warning: (message: string) => show('warning', message),
  error: (message: string) => show('error', message),
};
