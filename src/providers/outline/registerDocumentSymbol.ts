import * as vscode from 'vscode';
import {
  getConfigOutlineShowSymbolsInOutlinePanel,
  getConfigOutlineSymbolsList,
} from '../../config';
import type { EnabledOutlineCategories, LineSource } from './outlineExtractor';
import { extractOutlineSymbols } from './outlineExtractor';
import { symbolToDocumentSymbol } from './symbolToDocumentSymbol';

const OUTLINE_CATEGORIES = [
  'command',
  'ip_vrf',
  'router_bgp',
  'address_family',
  'class_map',
  'policy_map',
  'interface',
  'sub_interface',
  'route_map',
  'ip_prefix_list',
] as const;

const normalizeEnabledCategories = (
  configured: Record<string, boolean>,
): EnabledOutlineCategories =>
  Object.fromEntries(
    OUTLINE_CATEGORIES.map((category) => [
      category,
      configured[category] ?? true,
    ]),
  ) as EnabledOutlineCategories;

class CiscoConfigDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.DocumentSymbol[] {
    if (!getConfigOutlineShowSymbolsInOutlinePanel()) return [];

    const source: LineSource = {
      lineCount: document.lineCount,
      lineAt: (index) => document.lineAt(index).text,
    };
    const symbols = extractOutlineSymbols(
      source,
      normalizeEnabledCategories(getConfigOutlineSymbolsList()),
      () => token.isCancellationRequested,
    );
    if (token.isCancellationRequested) return [];
    return symbols.map(symbolToDocumentSymbol);
  }
}

export const registerDocumentSymbolProvider = (
  context: vscode.ExtensionContext,
): void => {
  const registration = vscode.languages.registerDocumentSymbolProvider(
    { language: 'cisco' },
    new CiscoConfigDocumentSymbolProvider(),
  );
  // Settings are read for every request. Keep the listener disposable wired so
  // future provider state can react to configuration changes without leaking.
  const configurationListener = vscode.workspace.onDidChangeConfiguration(
    () => undefined,
  );
  context.subscriptions.push(registration, configurationListener);
};

export {
  CiscoConfigDocumentSymbolProvider as CiscoConfigDocumentSymbolProviderForTest,
  normalizeEnabledCategories as normalizeEnabledCategoriesForTest,
};
