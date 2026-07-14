import type * as vscode from 'vscode';
import { outputChannel } from './channel';
import { registerUpdateInfo } from './providers/notification/registerUpdateInfo';
import { registerDocumentSymbolProvider } from './providers/outline/registerDocumentSymbol';

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    await registerUpdateInfo(context);
  } catch (err) {
    outputChannel.append(String(err));
  }
  registerDocumentSymbolProvider(context);
}
