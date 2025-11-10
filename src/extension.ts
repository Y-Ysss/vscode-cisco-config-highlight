import * as vscode from 'vscode';
import { registerOutlineSymbolProvider } from './registerOutlineSymbol';
import { registerUpdateInfo } from './registerUpdateInfo';

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
