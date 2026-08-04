import { CATEGORY_NAMES, type DeclarationMatch } from './declarationMatcher';
import type {
  OutlineCategory,
  OutlinePosition,
  OutlineRange,
  OutlineSymbol,
  OutlineSymbolType,
} from './outlineTypes';

export interface OutlineScope {
  symbols: OutlineSymbol[];
  categories: Map<OutlineCategory, OutlineSymbol>;
  interfaceBases: Map<string, OutlineSymbol>;
  ipPrefixLists: Map<string, OutlineSymbol>;
  accessLists: Map<string, OutlineSymbol>;
  activeCategory?: Exclude<OutlineCategory, 'command'>;
  parent?: OutlineSymbol;
}

const copyPosition = (position: OutlinePosition): OutlinePosition => ({
  line: position.line,
  character: position.character,
});

const comparePositions = (left: OutlinePosition, right: OutlinePosition) =>
  left.line - right.line || left.character - right.character;

export class OutlineTreeBuilder {
  readonly symbols: OutlineSymbol[] = [];
  private readonly parents = new Map<OutlineSymbol, OutlineSymbol>();

  createRootScope = (): OutlineScope => ({
    symbols: this.symbols,
    categories: new Map(),
    interfaceBases: new Map(),
    ipPrefixLists: new Map(),
    accessLists: new Map(),
  });

  createOutputScope = (parent?: OutlineSymbol): OutlineScope => ({
    symbols: parent?.children ?? this.symbols,
    categories: new Map(),
    interfaceBases: new Map(),
    ipPrefixLists: new Map(),
    accessLists: new Map(),
    parent,
  });

  extendRange = (symbol: OutlineSymbol, end: OutlinePosition): void => {
    if (comparePositions(symbol.range.end, end) < 0) {
      symbol.range.end = copyPosition(end);
    }
    const parent = this.parents.get(symbol);
    if (parent) this.extendRange(parent, end);
  };

  makeSymbol = (
    category: OutlineCategory,
    type: OutlineSymbolType,
    name: string,
    detail: string,
    selectionRange: OutlineRange,
  ): OutlineSymbol => ({
    category,
    type,
    name,
    detail,
    range: {
      start: copyPosition(selectionRange.start),
      end: copyPosition(selectionRange.end),
    },
    selectionRange,
    children: [],
  });

  startCategory = (
    scope: OutlineScope,
    category: Exclude<OutlineCategory, 'command'>,
  ): void => {
    const treeCategory = category === 'sub_interface' ? 'interface' : category;
    if (scope.activeCategory === treeCategory) return;

    scope.activeCategory = treeCategory;
    scope.categories.delete(treeCategory);
    scope.interfaceBases.clear();
    scope.ipPrefixLists.clear();
    scope.accessLists.clear();
  };

  addDeclaration = (
    scope: OutlineScope,
    match: DeclarationMatch,
    lineIndex: number,
    directParent?: OutlineSymbol,
  ): OutlineSymbol => {
    const selectionRange: OutlineRange = {
      start: { line: lineIndex, character: match.startCharacter },
      end: { line: lineIndex, character: match.endCharacter },
    };
    const symbol = this.makeSymbol(
      match.category,
      match.category,
      match.name,
      match.detail,
      selectionRange,
    );
    if (directParent) {
      directParent.children.push(symbol);
      this.parents.set(symbol, directParent);
    } else {
      const container = this.getCategory(scope, match.category, symbol);
      container.children.push(symbol);
      this.parents.set(symbol, container);
    }
    return symbol;
  };

  private getCategory = (
    scope: OutlineScope,
    category: Exclude<OutlineCategory, 'command'>,
    firstChild: OutlineSymbol,
  ): OutlineSymbol => {
    const treeCategory = category === 'sub_interface' ? 'interface' : category;
    const existing = scope.categories.get(treeCategory);
    if (existing) return existing;

    const container = this.makeSymbol(
      treeCategory,
      'category',
      CATEGORY_NAMES[treeCategory],
      '',
      {
        start: copyPosition(firstChild.selectionRange.start),
        end: copyPosition(firstChild.selectionRange.end),
      },
    );
    scope.categories.set(treeCategory, container);
    scope.symbols.push(container);
    if (scope.parent) this.parents.set(container, scope.parent);
    return container;
  };
}

export const copyOutlinePosition = copyPosition;
