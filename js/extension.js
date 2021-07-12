// Memo
// https://code.visualstudio.com/api/language-extensions/programmatic-language-features#show-all-symbol-definitions-within-a-document


'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vscode = require('vscode');
function activate(context) {
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: 'cisco' }, new CiscoConfigDocumentSymbolProvider()));
}
exports.activate = activate;
class CiscoConfigDocumentSymbolProvider {

    get pattern() {
        return /^(?:\s|\t)(?=\n)*(router\sbgp|address-family|class-map|policy-map|interface)(.*)$/gm;
        // |ip\svrf(?!.*forwarding)
    }

    get defs_outlines() {
        return {
            'router bgp': {
                kind: vscode.SymbolKind.Class,
                node_name: 'router bgp',
                detail: 'router bgp',
            },
            'address-family': {
                kind: vscode.SymbolKind.Field,
                node_name: 'router bgp',
                detail: 'address-family'
            },
            'class-map': {
                kind: vscode.SymbolKind.Variable,
                node_name: 'class-map',
                detail: 'class-map'
            },
            'policy-map': {
                kind: vscode.SymbolKind.Variable,
                node_name: 'policy-map',
                detail: 'policy-map'
            },
            'interface': {
                kind: vscode.SymbolKind.Class,
                node_name: 'interface',
                detail: 'interface',
                sub_nodes: [
                    {
                        pattern: /(.*)\.(.*)/,
                        kind: vscode.SymbolKind.Interface,
                        node_name: 'interface',
                        detail: 'sub-interface'
                    }
                ]
            },
            // 'ip vrf': {
            //     kind: vscode.SymbolKind.Class,
            //     node_name: 'ip vrf',
            //     detail: 'vrf'
            // },
        }
    }

    provideDocumentSymbols(document, token) {
        return new Promise((resolve, reject) => {
            let symbols = [];
            let nodes = [symbols];
            let node_name = '';
            let inside_group = false;
            const text = document.getText();

            const matchedList = this.patternMatchAll(this.pattern, text);
            matchedList.map((matched) => {
                const info_type = matched[1];
                const info_name = matched[2];
                const info = this.defs_outlines[info_type];
                const position = document.lineAt(document.positionAt(matched.index).line + 1).range;
                if (node_name !== info.node_name) {
                    if (inside_group) {
                        nodes.pop();
                        inside_group = false;
                    }
                    const symbol = new vscode.DocumentSymbol(info_type, '', vscode.SymbolKind.Namespace, position, position);
                    nodes[nodes.length - 1].push(symbol);
                    if (!inside_group) {
                        nodes.push(symbol.children);
                        inside_group = true;
                    }
                }

                let symbol = new vscode.DocumentSymbol(info_name, info.detail, this.defs_outlines[info_type].kind, position, position);
                let target = nodes[nodes.length - 1];

                const sub_nodes = nodes[nodes.length - 1];
                node_name = info.node_name;

                if (info_type !== info.node_name && sub_nodes[sub_nodes.length - 1]) {
                    target = sub_nodes[sub_nodes.length - 1].children;
                    node_name = info.node_name;
                }

                if (info.sub_nodes) {
                    info.sub_nodes.map((item) => {
                        const m = info_name.match(item.pattern)
                        if (m) {
                            symbol.detail = item.detail
                        }
                        const s = sub_nodes[sub_nodes.length - 1]
                        if (m && s && s.name == m[1]) {
                            symbol = new vscode.DocumentSymbol(info_name, item.detail, item.kind, position, position);
                            target = s.children;
                        }
                    })
                }
                target.push(symbol);
            });
            resolve(symbols);
        });
    }


    patternMatchAll(pattern, text) {
        const out = [];
        pattern.lastIndex = 0;
        let match;
        while (match = pattern.exec(text)) {
            out.push(match);
        }
        return out;
    }

}