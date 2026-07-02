import * as semver from 'semver';
import * as vscode from 'vscode';
import { outputChannel } from '../../extension';
import {
  type NotificationInfo,
  notificationConditions,
} from './notificationConditions';

export async function registerUpdateInfo(
  context: vscode.ExtensionContext,
): Promise<void> {
  const versionKey = `previous_version`;
  context.globalState.setKeysForSync([versionKey]);

  // https://code.visualstudio.com/api/extension-capabilities/common-capabilities
  const previousVersion: string | undefined =
    context.globalState.get(versionKey);
  const currentVersion = (context.extension as Extension).packageJSON.version;
  await context.globalState.update(versionKey, currentVersion);
  outputChannel.appendLine(
    `previousVersion: ${previousVersion}, currentVersion:${currentVersion}`,
  );
  if (previousVersion && isIgnore(previousVersion, currentVersion)) {
    outputChannel.appendLine(
      `Is patch version. previousVersion: ${previousVersion}, currentVersion:${currentVersion}`,
    );
    return;
  }
  notificationConditions.forEach((info) => {
    if (
      !previousVersion ||
      semver.satisfies(previousVersion, info.version_info)
    ) {
      const prev = previousVersion ? previousVersion : 'undefined';
      let message = info.message.replaceAll('${previousVersion}', prev);
      message = message.replaceAll('${currentVersion}', currentVersion);
      outputChannel.appendLine(message);
      const dialog = getDialog(info, message);
      void dialog.then(async (selected) => {
        if (!shouldRunAction(selected, info.button_label)) {
          return;
        }
        try {
          await info.action(prev, currentVersion);
        } catch (err) {
          outputChannel.appendLine(String(err));
        }
      });
    }
  });
}

function getDialog(
  info: NotificationInfo,
  message: string,
): Thenable<string | undefined> {
  if (info.type === 'info') {
    return vscode.window.showInformationMessage(message, info.button_label);
  }
  return vscode.window.showWarningMessage(message, info.button_label);
}

export function isIgnore(
  previousVersion: string,
  currentVersion: string,
): boolean {
  if (!semver.lt(previousVersion, currentVersion)) {
    // Same version or downgrade: ignore
    return true;
  }
  const differs: semver.ReleaseType | null = semver.diff(
    previousVersion,
    currentVersion,
  );
  return !differs || differs === 'patch';
}

export function shouldRunAction(
  selected: string | undefined,
  buttonLabel: string,
): boolean {
  return selected === buttonLabel;
}
