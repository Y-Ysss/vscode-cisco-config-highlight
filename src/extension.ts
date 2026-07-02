import * as vscode from 'vscode';
import { registerUpdateInfo } from './providers/notification/registerUpdateInfo';
import { registerOutlineSymbolProvider } from './providers/outline/registerOutlineSymbol';

export const outputChannel = vscode.window.createOutputChannel(
  'Cisco Config Highlight',
);

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    await registerUpdateInfo(context);
  } catch (err) {
    outputChannel.append(String(err));
  }
  registerOutlineSymbolProvider(context);
}
