import * as vscode from 'vscode';
import { registerUpdateInfo } from './registerUpdateInfo';
import { registerOutlineSymbolProvider } from './registerOutlineSymbol';

export function activate(context: vscode.ExtensionContext): void {
    registerUpdateInfo(context);
    registerOutlineSymbolProvider(context);
}
