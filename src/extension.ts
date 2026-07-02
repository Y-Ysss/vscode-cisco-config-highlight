import type * as vscode from 'vscode';
import { outputChannel } from './channel';
import { registerUpdateInfo } from './providers/notification/registerUpdateInfo';
import { registerOutlineSymbolProvider } from './providers/outline/registerOutlineSymbol';

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
