import * as vscode from 'vscode';

const CHANGELOG_URL =
  'https://github.com/Y-Ysss/vscode-cisco-config-highlight/blob/main/CHANGELOG.md';

export const openChangelog = async (): Promise<void> => {
  await vscode.env.openExternal(vscode.Uri.parse(CHANGELOG_URL));
};
