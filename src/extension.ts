import * as vscode from 'vscode';
import { symbolsInfo } from './symbolsInfo';

export function activate(context: vscode.ExtensionContext): void {

  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: 'cisco' }, new CiscoConfigDocumentSymbolProvider()))
}


const regExpJoin = (delimiter: string, list: RegExp[]): RegExp => {
  return new RegExp(list.map((item: RegExp) => { return item.source }).join(delimiter))
}


class CiscoConfigDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

  regexPattern(name: string): RegExp {
    const d = symbolsInfo[name]
    return RegExp(`(?<index_${name}>${d.pattern.source})(?<submatch_${name}>${d.item_pattern.source})`)
  }


  patterns(): { bool: boolean, value?: RegExp } {
    const symbols: { [name: string]: boolean } = vscode.workspace.getConfiguration('cisco-config-highlight').get('outline.symbolsList', {})
    const patterns: RegExp[] = Object.entries(symbols).filter(item => item[1]).map(item => { return this.regexPattern(item[0]) })
    if (!patterns.length) {
      return { bool: false }
    }
    return { bool: true, value: regExpJoin('|', patterns) }
  }

  provideDocumentSymbols(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
    return new Promise((resolve, reject) => {
      let symbols: vscode.DocumentSymbol[] = [];
      const enabledOutlinePanel = vscode.workspace.getConfiguration('cisco-config-highlight').get('outline.showSymbolsInOutlinePanel', false)
      if (!enabledOutlinePanel) {
        reject('Cisco Config Highlight: The outline panel view of the symbol is disabled.')
      }
      const text = document.getText();
      let patterns = this.patterns()
      if (!patterns.bool) {
        reject('Cisco Config Highlight: Symbol is not selected.')
      }
      let category_name = ''
      let parent_name = ''
      text.split(/\r?\n/).forEach((item:string, i:number) => {
        let m: RegExpMatchArray | null = item.match(patterns.value || '')
        if (m?.groups) {
          const data = Object.entries(m.groups).filter(item => item[1] !== undefined)
          if (data[1][1] === '') {
            return
          }
          let info = symbolsInfo[data[0][0].slice(6)]
          const position = document.lineAt(i).range
          if (symbols.length > 0 && symbols[symbols.length - 1]) {
            category_name = symbols[symbols.length - 1].name
          }
          if (category_name !== info.category_name) {
            symbols.push(new vscode.DocumentSymbol(info.category_name, '', info.parent_kind ? info.parent_kind : vscode.SymbolKind.Namespace, position, position))
          }
          if (info.parent_name) {
            let pm = data[1][1].match(info.parent_name || '')
            if (pm) {
              parent_name = pm[0]
            }
          }
          const category = symbols[symbols.length - 1]
          const node: vscode.DocumentSymbol = category.children[category.children.length - 1]
          if (category.children.length > 0 && parent_name === data[1][1].trim() && node.detail !== info.detail) {
            node.children.push(new vscode.DocumentSymbol(data[1][1].trim(), info.detail, info.kind, position, position))
          } else {
            symbols[symbols.length - 1].children.push(new vscode.DocumentSymbol(data[1][1].trim(), info.detail, info.kind, position, position))
          }
        }
      });
      resolve(symbols)
    })
  }
}