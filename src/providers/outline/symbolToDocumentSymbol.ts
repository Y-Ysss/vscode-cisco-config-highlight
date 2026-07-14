import * as vscode from 'vscode';
import type {
  OutlineRange,
  OutlineSymbol,
  OutlineSymbolType,
} from './outlineExtractor';

const toRange = (range: OutlineRange): vscode.Range =>
  new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  );

const toSymbolKind = (symbol: OutlineSymbol): vscode.SymbolKind => {
  const kinds: Record<OutlineSymbolType, vscode.SymbolKind> = {
    command: vscode.SymbolKind.Event,
    category: vscode.SymbolKind.Namespace,
    truncation: vscode.SymbolKind.String,
    ip_vrf: vscode.SymbolKind.Field,
    router_bgp: vscode.SymbolKind.Class,
    address_family: vscode.SymbolKind.Field,
    class_map: vscode.SymbolKind.Variable,
    policy_map: vscode.SymbolKind.Variable,
    interface: vscode.SymbolKind.Class,
    sub_interface: vscode.SymbolKind.Interface,
    route_map: vscode.SymbolKind.Variable,
    ip_prefix_list: vscode.SymbolKind.Constant,
  };
  return kinds[symbol.type];
};

export const symbolToDocumentSymbol = (
  symbol: OutlineSymbol,
): vscode.DocumentSymbol => {
  const documentSymbol = new vscode.DocumentSymbol(
    symbol.name,
    symbol.detail,
    toSymbolKind(symbol),
    toRange(symbol.range),
    toRange(symbol.selectionRange),
  );
  documentSymbol.children = symbol.children.map(symbolToDocumentSymbol);
  return documentSymbol;
};
