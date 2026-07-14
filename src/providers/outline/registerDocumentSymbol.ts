import * as vscode from 'vscode';
import {
  getConfigOutlineMaxFileSizeForFullScan,
  getConfigOutlineShowSymbolsInOutlinePanel,
  getConfigOutlineSymbolsList,
} from '../../config';
import type { EnabledOutlineCategories, LineSource } from './outlineExtractor';
import {
  extractOutlineSymbols,
  measureOutlineDocument,
  OUTLINE_CATEGORIES,
} from './outlineExtractor';
import { symbolToDocumentSymbol } from './symbolToDocumentSymbol';

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

    const maxFileSizeForFullScan = getConfigOutlineMaxFileSizeForFullScan();
    const measurement = measureOutlineDocument(
      document.getText(),
      maxFileSizeForFullScan,
      document.lineCount,
    );
    const isTruncated = measurement.byteSize > maxFileSizeForFullScan;
    const source: LineSource = {
      lineCount: isTruncated ? measurement.prefixLineCount : document.lineCount,
      lineAt: (index) => document.lineAt(index).text,
    };
    const symbols = extractOutlineSymbols(
      source,
      normalizeEnabledCategories(getConfigOutlineSymbolsList()),
      () => token.isCancellationRequested,
      isTruncated,
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
