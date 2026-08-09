import * as semver from 'semver';
import * as vscode from 'vscode';
import { outputChannel } from '../../channel';
import { openChangelog } from './notificationAction';
import {
  type NotificationInfo,
  notificationConditions,
} from './notificationConditions';

const VERSION_KEY = 'previous_version';
const CHANGELOG_BUTTON_LABEL = 'Show Changelog';

export async function registerUpdateInfo(
  context: vscode.ExtensionContext,
): Promise<void> {
  context.globalState.setKeysForSync([]);
  const previousVersion: string | undefined =
    context.globalState.get(VERSION_KEY);
  const currentVersion = (context.extension as Extension).packageJSON.version;
  await context.globalState.update(VERSION_KEY, currentVersion);
  outputChannel.appendLine(
    `Release notification check: previous=${previousVersion ?? 'none'}, current=${currentVersion}`,
  );

  if (!previousVersion) {
    outputChannel.appendLine('Release notification skipped: first install.');
    return;
  }

  const applicableNotifications = getApplicableNotifications(
    previousVersion,
    currentVersion,
  );
  if (applicableNotifications.length === 0) {
    outputChannel.appendLine(
      'Release notification skipped: no incompatible release crossed.',
    );
    return;
  }

  const message = buildNotificationMessage(
    previousVersion,
    currentVersion,
    applicableNotifications,
  );
  outputChannel.appendLine(message);
  const dialog = getDialog(
    applicableNotifications,
    message,
    CHANGELOG_BUTTON_LABEL,
  );
  void Promise.resolve(dialog)
    .then(async (selected) => {
      if (shouldRunAction(selected, CHANGELOG_BUTTON_LABEL)) {
        await openChangelog();
      }
    })
    .catch((err: unknown) => {
      outputChannel.appendLine(
        `Release notification action failed: ${String(err)}`,
      );
    });
}

export function getApplicableNotifications(
  previousVersion: string,
  currentVersion: string,
): NotificationInfo[] {
  if (
    !semver.valid(previousVersion) ||
    !semver.valid(currentVersion) ||
    !semver.lt(previousVersion, currentVersion)
  ) {
    return [];
  }

  return notificationConditions.filter(
    (info) =>
      semver.lt(previousVersion, info.introducedIn) &&
      semver.lte(info.introducedIn, currentVersion),
  );
}

function buildNotificationMessage(
  previousVersion: string,
  currentVersion: string,
  notifications: NotificationInfo[],
): string {
  const details = notifications.map((info) => info.message).join(' ');
  return `Updated from ${previousVersion} to ${currentVersion}. This update includes incompatible changes. ${details}`;
}

function getDialog(
  notifications: NotificationInfo[],
  message: string,
  buttonLabel: string,
): Thenable<string | undefined> {
  if (notifications.some((info) => info.type === 'warn')) {
    return vscode.window.showWarningMessage(message, buttonLabel);
  }
  return vscode.window.showInformationMessage(message, buttonLabel);
}

export function shouldRunAction(
  selected: string | undefined,
  buttonLabel: string,
): boolean {
  return selected === buttonLabel;
}
