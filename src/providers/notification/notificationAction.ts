import * as vscode from 'vscode';
import { outputChannel } from '../../channel';

// Unused ideas
// https://code.visualstudio.com/api/extension-guides/webview

export type Action = (
  _previousVersion: string,
  _currentVersion: string,
) => Promise<void>;

export const default_action = async (
  _previousVersion: string,
  _currentVersion: string,
): Promise<void> => {
  try {
    await vscode.commands.executeCommand(
      'extension.open',
      'Y-Ysss.cisco-config-highlight',
    );
  } catch (err) {
    outputChannel.appendLine(String(err));
  }
};
