import { SymbolKind } from "vscode"

type SymbolInfo = {
    pattern: RegExp,
    kind: SymbolKind,
    parent_kind?: SymbolKind,
    node_name: string,
    category_name: string,
    parent_name?: string
    detail: string,
    item_pattern: RegExp
}


export const symbolsInfo: { [name: string]: SymbolInfo } = {
    'command': {
        pattern: /^(?:\s|\t)*\S*(?:(#|>))(?!.*(#|>|\s)$)/,
        kind: SymbolKind.String,
        parent_kind: SymbolKind.Event,
        node_name: 'command',
        category_name: 'command',
        detail: 'command',
        item_pattern: /.*$/
    },
    'ip_vrf': {
        pattern: /^(?:\s|\t)*ip\svrf(?!\sforwarding)(?:\s)/,
        kind: SymbolKind.Field,
        node_name: 'ip_vrf',
        category_name: 'ip_vrf',
        detail: 'ip vrf',
        item_pattern: /.*$/
    },
    'router_bgp': {
        pattern: /^(?:\s|\t)*router\sbgp(?:\s)/,
        kind: SymbolKind.Class,
        node_name: 'router_bgp',
        category_name: 'router bgp',
        detail: 'router bgp',
        item_pattern: /\d*$/
    },
    'address_family': {
        pattern: /^(?:\s|\t)*(address-family)(?:\s)/,
        kind: SymbolKind.Field,
        node_name: 'address_family',
        category_name: 'router bgp',
        parent_name: '.*',
        detail: 'address-family',
        item_pattern: /.*$/
    },
    'class_map': {
        pattern: /^(?:\s|\t)*(class-map)(?:\s)/,
        kind: SymbolKind.Variable,
        node_name: 'class_map',
        category_name: 'class-map',
        detail: 'class-map',
        item_pattern: /.*$/

    },
    'policy_map': {
        pattern: /^(?:\s|\t)*(policy-map)(?:\s)/,
        kind: SymbolKind.Variable,
        node_name: 'policy_map',
        category_name: 'policy-map',
        detail: 'policy-map',
        item_pattern: /.*$/

    },
    'interface': {
        pattern: /^(?:\s|\t)*(interface)(?:\s)/,
        kind: SymbolKind.Class,
        node_name: 'interface',
        category_name: 'interface',
        detail: 'interface',
        item_pattern: /[^.]*$/
    },
    'sub_interface': {
        pattern: /^(?:\s|\t)*(interface)(?:\s)/,
        kind: SymbolKind.Interface,
        node_name: 'interface',
        category_name: 'interface',
        parent_name: '.+\.',
        detail: 'sub-interface',
        item_pattern: /.*\..*$/
    }
}