import { describe, expect, it } from 'vitest';
import { SymbolKind } from 'vscode';
import type { OutlineSymbol, OutlineSymbolType } from './outlineExtractor';
import { symbolToDocumentSymbol } from './symbolToDocumentSymbol';

const symbol = (
  type: OutlineSymbolType,
  children: OutlineSymbol[] = [],
): OutlineSymbol => ({
  category: type === 'category' ? 'interface' : type,
  type,
  name: `${type} name`,
  detail: `${type} detail`,
  range: {
    start: { line: 2, character: 3 },
    end: { line: 8, character: 13 },
  },
  selectionRange: {
    start: { line: 2, character: 7 },
    end: { line: 2, character: 19 },
  },
  children,
});

describe('symbolToDocumentSymbol', () => {
  it.each([
    ['category', SymbolKind.Namespace],
    ['command', SymbolKind.Event],
    ['ip_vrf', SymbolKind.Field],
    ['router_bgp', SymbolKind.Class],
    ['address_family', SymbolKind.Field],
    ['class_map', SymbolKind.Variable],
    ['policy_map', SymbolKind.Variable],
    ['interface', SymbolKind.Class],
    ['sub_interface', SymbolKind.Interface],
    ['route_map', SymbolKind.Variable],
    ['ip_prefix_list', SymbolKind.Constant],
  ] as const)('maps %s to the explicit SymbolKind', (type, kind) => {
    expect(symbolToDocumentSymbol(symbol(type)).kind).toBe(kind);
  });

  it('recursively preserves names, details, exact ranges, and children', () => {
    const child = symbol('sub_interface');
    const result = symbolToDocumentSymbol(symbol('interface', [child]));

    expect(result).toMatchObject({
      name: 'interface name',
      detail: 'interface detail',
      range: {
        start: { line: 2, character: 3 },
        end: { line: 8, character: 13 },
      },
      selectionRange: {
        start: { line: 2, character: 7 },
        end: { line: 2, character: 19 },
      },
    });
    expect(result.children).toHaveLength(1);
    expect(result.children[0]).toMatchObject({
      name: 'sub_interface name',
      detail: 'sub_interface detail',
      kind: SymbolKind.Interface,
    });
  });
});
