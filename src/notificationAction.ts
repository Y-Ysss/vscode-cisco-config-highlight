import * as vscode from 'vscode';

// Unused ideas
// https://code.visualstudio.com/api/extension-guides/webview

export const default_action = (previousVersion: string, currentVersion: string): void => {
    console.log('default-action', previousVersion, currentVersion)
    vscode.commands.executeCommand('extension.open', 'Y-Ysss.cisco-config-highlight');
}