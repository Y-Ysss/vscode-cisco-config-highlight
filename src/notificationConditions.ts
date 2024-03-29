import { default_action } from './notificationAction';

type MessageType = 'info' | 'warn';

export type NotificationInfo = {
    type: MessageType,
    version_info: string,
    messege: string,
    button_label: string,
    action: any
}

export const notificationConditions: NotificationInfo[] = [
    {
        type: 'info',
        version_info: '<0.4.0',
        messege: 'Updated from lower version (${previousVersion}). Version ${currentVersion} contains changes incompatible with version <0.4.0. Please check Changelog for details.',
        button_label: 'Show Changelog',
        action: default_action
    }
]

