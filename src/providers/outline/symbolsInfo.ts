import { SymbolKind } from 'vscode';

interface SymbolInfo {
  pattern: RegExp;
  kind: SymbolKind;
  parent_kind?: SymbolKind;
  category_name: string;
  parent_name?: string;
  detail: string;
  item_pattern: RegExp;
}

export const symbolsInfo: Record<string, SymbolInfo> = {
  command: {
    pattern: /^(?!\s)[0-9a-zA-Z-]+(?:(#|>))(?!.*(#|>|\s)$)/,
    kind: SymbolKind.String,
    parent_kind: SymbolKind.Event,
    category_name: 'command',
    detail: 'command',
    item_pattern: /.*$/,
  },
  ip_vrf: {
    pattern: /^[ \t]*ip\svrf(?!\sforwarding)[ \t]/,
    kind: SymbolKind.Field,
    category_name: 'ip_vrf',
    detail: 'ip vrf',
    item_pattern: /.*$/,
  },
  router_bgp: {
    pattern: /^[ \t]*router\sbgp[ \t]/,
    kind: SymbolKind.Class,
    category_name: 'router bgp',
    detail: 'router bgp',
    item_pattern: /\d*$/,
  },
  address_family: {
    pattern: /^[ \t]*(address-family)[ \t]/,
    kind: SymbolKind.Field,
    category_name: 'router bgp',
    parent_name: '.*',
    detail: 'address-family',
    item_pattern: /.*$/,
  },
  class_map: {
    pattern: /^[ \t]*(class-map)[ \t]/,
    kind: SymbolKind.Variable,
    category_name: 'class-map',
    detail: 'class-map',
    item_pattern: /.*$/,
  },
  policy_map: {
    pattern: /^[ \t]*(policy-map)[ \t]/,
    kind: SymbolKind.Variable,
    category_name: 'policy-map',
    detail: 'policy-map',
    item_pattern: /.*$/,
  },
  interface: {
    pattern: /^[ \t]*(interface)[ \t]/,
    kind: SymbolKind.Class,
    category_name: 'interface',
    detail: 'interface',
    item_pattern: /[^.]*$/,
  },
  sub_interface: {
    pattern: /^[ \t]*(interface)[ \t]/,
    kind: SymbolKind.Interface,
    category_name: 'interface',
    parent_name: '.+.',
    detail: 'sub-interface',
    item_pattern: /.*\..*$/,
  },
};
