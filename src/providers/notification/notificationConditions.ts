type MessageType = 'info' | 'warn';

export interface NotificationInfo {
  type: MessageType;
  introducedIn: string;
  message: string;
}

export const notificationConditions: NotificationInfo[] = [
  {
    type: 'info',
    introducedIn: '0.4.0',
    message:
      '0.4.0 changed token category names; custom Token Colors may need updates.',
  },
  {
    type: 'info',
    introducedIn: '0.6.0',
    message:
      '0.6.0 subdivided Token Scopes; custom Token Colors may need updates, and this may be a breaking change for users customizing colors.',
  },
];
