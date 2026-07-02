import * as vscode from 'vscode';
import {
  getConfigOutlineShowSymbolsInOutlinePanel,
  getConfigOutlineSymbolsList,
} from '../../config';
import { EXTENSION_ID } from '../../contributions/configurations';
import { symbolsInfo } from './symbolsInfo';

export function registerOutlineSymbolProvider(
  context: vscode.ExtensionContext,
) {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'cisco' },
      new CiscoConfigDocumentSymbolProvider(),
    ),
    // Invalidate the pattern cache when configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(EXTENSION_ID)) {
        invalidatePatternCache();
      }
    }),
  );
}

const regExpJoin = (delimiter: string, list: RegExp[]): RegExp => {
  return new RegExp(
    list
      .map((item: RegExp) => {
        return item.source;
      })
      .join(delimiter),
  );
};

const regexPattern = (name: string): RegExp => {
  const d = symbolsInfo[name];
  return RegExp(
    `(?<index_${name}>${d.pattern.source})(?<submatch_${name}>${d.item_pattern.source})`,
  );
};

const buildSettingsPattern = (): RegExp | null => {
  const symbols: Record<string, boolean> = getConfigOutlineSymbolsList();
  const patterns: RegExp[] = Object.entries(symbols)
    .filter(([, enabled]) => enabled)
    .map(([name]) => regexPattern(name));
  return patterns.length ? regExpJoin('|', patterns) : null;
};

// Pattern cache: undefined = not yet built, null = built but no symbols enabled
let patternCache: RegExp | null | undefined;

const invalidatePatternCache = (): void => {
  patternCache = undefined;
};

const getCachedPattern = (): RegExp | null => {
  if (patternCache === undefined) {
    patternCache = buildSettingsPattern();
  }
  return patternCache;
};

class CiscoConfigDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.DocumentSymbol[] {
    const enabledOutlinePanel = getConfigOutlineShowSymbolsInOutlinePanel();
    if (!enabledOutlinePanel) {
      return [];
    }
    const pattern = getCachedPattern();
    if (!pattern) {
      return [];
    }
    const symbols: vscode.DocumentSymbol[] = [];
    const INDEX_PREFIX_LEN = 'index_'.length;
    let category_name = '';
    let parent_name = '';
    let base_node = symbols;
    let parent_node = symbols;
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const m: RegExpMatchArray | null = line.text.match(pattern);
      if (!m?.groups) {
        continue;
      }
      const data = Object.entries(m.groups).filter(([, v]) => v !== undefined);
      if (data[1][1] === '') {
        continue;
      }
      const label = data[1][1].trim();
      const info = symbolsInfo[data[0][0].slice(INDEX_PREFIX_LEN)];
      const position = line.range;
      if (info.category_name === 'command') {
        symbols.push(
          new vscode.DocumentSymbol(
            label,
            info.detail,
            vscode.SymbolKind.Event,
            position,
            position,
          ),
        );
        parent_node = symbols[symbols.length - 1].children;
        base_node = symbols[symbols.length - 1].children;
        category_name = info.category_name;
        continue;
      }

      if (category_name !== info.category_name) {
        base_node.push(
          new vscode.DocumentSymbol(
            info.category_name,
            '',
            info.parent_kind ?? vscode.SymbolKind.Namespace,
            position,
            position,
          ),
        );
        parent_node = base_node[base_node.length - 1].children;
        category_name = info.category_name;
      }

      if (info.parent_name) {
        const matched = label.match(info.parent_name);
        if (matched) {
          parent_name = matched[0];
        }
      }

      const node: vscode.DocumentSymbol = parent_node[parent_node.length - 1];
      if (
        parent_node.length > 0 &&
        parent_name === label &&
        node.detail !== info.detail
      ) {
        node.children.push(
          new vscode.DocumentSymbol(
            label,
            info.detail,
            info.kind,
            position,
            position,
          ),
        );
      } else {
        parent_node.push(
          new vscode.DocumentSymbol(
            label,
            info.detail,
            info.kind,
            position,
            position,
          ),
        );
      }
    }
    return symbols;
  }
}

export {
  CiscoConfigDocumentSymbolProvider as CiscoConfigDocumentSymbolProviderForTest,
  invalidatePatternCache as invalidatePatternCacheForTest,
};
