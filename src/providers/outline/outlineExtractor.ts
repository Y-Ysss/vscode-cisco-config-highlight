import { skipLeadingWhitespace } from '../../parser/lineScanUtils';

export type OutlineCategory =
  | 'command'
  | 'ip_vrf'
  | 'router_bgp'
  | 'address_family'
  | 'class_map'
  | 'policy_map'
  | 'interface'
  | 'sub_interface'
  | 'route_map'
  | 'ip_prefix_list';

export type OutlineSymbolType = 'category' | OutlineCategory;

export interface OutlinePosition {
  line: number;
  character: number;
}

export interface OutlineRange {
  start: OutlinePosition;
  end: OutlinePosition;
}

export interface OutlineSymbol {
  category: OutlineCategory;
  type: OutlineSymbolType;
  name: string;
  detail: string;
  range: OutlineRange;
  selectionRange: OutlineRange;
  children: OutlineSymbol[];
}

export type EnabledOutlineCategories = Record<OutlineCategory, boolean>;

export interface LineSource {
  readonly lineCount: number;
  lineAt(index: number): string;
}

interface DeclarationMatch {
  category: Exclude<OutlineCategory, 'command'>;
  detail: string;
  name: string;
  startCharacter: number;
  endCharacter: number;
}

interface Scope {
  symbols: OutlineSymbol[];
  categories: Map<OutlineCategory, OutlineSymbol>;
  interfaceBases: Map<string, OutlineSymbol>;
  parent?: OutlineSymbol;
}

interface ActiveDeclaration {
  kind: Exclude<OutlineCategory, 'command' | 'address_family'>;
  symbol?: OutlineSymbol;
  rangeParent?: OutlineSymbol;
}

interface OutputCandidate {
  symbol?: OutlineSymbol;
  scope: Scope;
  becameParent: boolean;
}

const PROMPT_PATTERN =
  /^[0-9a-z][0-9a-z._-]*(?:\([^\r\n()]+\))?[#>](?<command>.*)$/i;
const SHOW_COMMAND_PATTERN = /^(?:do\s+)?(?:sh|sho|show)\b/i;

const CATEGORY_NAMES: Record<Exclude<OutlineCategory, 'command'>, string> = {
  ip_vrf: 'ip vrf',
  router_bgp: 'router bgp',
  address_family: 'address-family',
  class_map: 'class-map',
  policy_map: 'policy-map',
  interface: 'interface',
  sub_interface: 'interface',
  route_map: 'route-map',
  ip_prefix_list: 'ip prefix-list',
};

const copyPosition = (position: OutlinePosition): OutlinePosition => ({
  line: position.line,
  character: position.character,
});

const comparePositions = (left: OutlinePosition, right: OutlinePosition) =>
  left.line - right.line || left.character - right.character;

const declarationMatch = (
  line: string,
  startCharacter: number,
): DeclarationMatch | undefined => {
  const text = line.slice(startCharacter);
  const prefix = text.slice(0, 2).toLowerCase();
  let match: RegExpMatchArray | null = null;
  let category: DeclarationMatch['category'] | undefined;
  let detail = '';

  switch (prefix) {
    case 'ad':
      match = text.match(/^address-family[ \t]+(?<name>.+?)\s*$/i);
      category = 'address_family';
      detail = 'address-family';
      break;
    case 'cl':
      match = text.match(/^class-map[ \t]+(?<name>.+?)\s*$/i);
      category = 'class_map';
      detail = 'class-map';
      break;
    case 'in':
      match = text.match(/^interface[ \t]+(?<name>.+?)\s*$/i);
      if (match?.groups) {
        category = match.groups.name.includes('.')
          ? 'sub_interface'
          : 'interface';
      }
      detail = category === 'sub_interface' ? 'sub-interface' : 'interface';
      break;
    case 'ip':
      match = text.match(
        /^ip[ \t]+vrf(?![ \t]+forwarding(?:[ \t]|$))[ \t]+(?<name>.+?)\s*$/i,
      );
      if (match) {
        category = 'ip_vrf';
        detail = 'ip vrf';
      } else {
        match = text.match(/^ip[ \t]+prefix-list[ \t]+(?<name>.+?)\s*$/i);
        category = 'ip_prefix_list';
        detail = 'ip prefix-list';
      }
      break;
    case 'po':
      match = text.match(/^policy-map[ \t]+(?<name>.+?)\s*$/i);
      category = 'policy_map';
      detail = 'policy-map';
      break;
    case 'ro':
      match = text.match(/^router[ \t]+bgp[ \t]+(?<name>.+?)\s*$/i);
      if (match) {
        category = 'router_bgp';
        detail = 'router bgp';
      } else {
        match = text.match(/^route-map[ \t]+(?<name>.+?)\s*$/i);
        category = 'route_map';
        detail = 'route-map';
      }
      break;
    default:
      return undefined;
  }

  if (!match?.groups || !category) return undefined;
  return {
    category,
    detail,
    name: match.groups.name,
    startCharacter,
    endCharacter: line.trimEnd().length,
  };
};

export const extractOutlineSymbols = (
  source: LineSource,
  enabledCategories: EnabledOutlineCategories,
  isCancelled: () => boolean = () => false,
): OutlineSymbol[] => {
  const symbols: OutlineSymbol[] = [];
  const parents = new Map<OutlineSymbol, OutlineSymbol>();
  const rootScope: Scope = {
    symbols,
    categories: new Map(),
    interfaceBases: new Map(),
  };
  let outputCandidate: OutputCandidate | undefined;
  let activeDeclaration: ActiveDeclaration | undefined;
  let activeAddressFamily: ActiveDeclaration | undefined;
  let previousEnd: OutlinePosition = { line: 0, character: 0 };

  const extendRange = (symbol: OutlineSymbol, end: OutlinePosition): void => {
    if (comparePositions(symbol.range.end, end) < 0) {
      symbol.range.end = copyPosition(end);
    }
    const parent = parents.get(symbol);
    if (parent) extendRange(parent, end);
  };

  const finish = (
    active: ActiveDeclaration | undefined,
    end: OutlinePosition,
  ): void => {
    if (active?.symbol) extendRange(active.symbol, end);
    else if (active?.rangeParent) extendRange(active.rangeParent, end);
  };

  const closeDeclarations = (end: OutlinePosition): void => {
    finish(activeAddressFamily, end);
    finish(activeDeclaration, end);
    activeAddressFamily = undefined;
    activeDeclaration = undefined;
  };

  const closeOutput = (end: OutlinePosition): void => {
    if (outputCandidate?.becameParent && outputCandidate.symbol) {
      extendRange(outputCandidate.symbol, end);
    }
    outputCandidate = undefined;
  };

  const makeSymbol = (
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

  const getCategory = (
    scope: Scope,
    category: Exclude<OutlineCategory, 'command'>,
    firstChild: OutlineSymbol,
  ): OutlineSymbol => {
    const treeCategory = category === 'sub_interface' ? 'interface' : category;
    const existing = scope.categories.get(treeCategory);
    if (existing) return existing;

    const container = makeSymbol(
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
    if (scope.parent) parents.set(container, scope.parent);
    return container;
  };

  const addDeclaration = (
    scope: Scope,
    match: DeclarationMatch,
    lineIndex: number,
    directParent?: OutlineSymbol,
  ): OutlineSymbol => {
    const selectionRange: OutlineRange = {
      start: { line: lineIndex, character: match.startCharacter },
      end: { line: lineIndex, character: match.endCharacter },
    };
    const symbol = makeSymbol(
      match.category,
      match.category,
      match.name,
      match.detail,
      selectionRange,
    );
    if (directParent) {
      directParent.children.push(symbol);
      parents.set(symbol, directParent);
    } else {
      const container = getCategory(scope, match.category, symbol);
      container.children.push(symbol);
      parents.set(symbol, container);
    }
    return symbol;
  };

  for (let lineIndex = 0; lineIndex < source.lineCount; lineIndex += 1) {
    if ((lineIndex & 255) === 0 && isCancelled()) return [];

    const line = source.lineAt(lineIndex);
    const lineEnd = { line: lineIndex, character: line.length };

    let promptMatch: RegExpMatchArray | null = null;
    if (
      line.length > 1 &&
      line[0] !== ' ' &&
      line[0] !== '\t' &&
      (line.includes('#') || line.includes('>'))
    ) {
      promptMatch = line.match(PROMPT_PATTERN);
    }

    if (promptMatch?.groups) {
      if (isCancelled()) return [];
      closeDeclarations(previousEnd);
      closeOutput(previousEnd);

      const rawCommand = promptMatch.groups.command;
      const command = rawCommand.trim();
      if (command.length > 0) {
        const commandStart =
          line.length - rawCommand.length + skipLeadingWhitespace(rawCommand);
        const selectionRange: OutlineRange = {
          start: { line: lineIndex, character: commandStart },
          end: { line: lineIndex, character: line.trimEnd().length },
        };
        const commandSymbol = enabledCategories.command
          ? makeSymbol('command', 'command', command, 'command', selectionRange)
          : undefined;
        if (commandSymbol) {
          commandSymbol.range.start = { line: lineIndex, character: 0 };
          symbols.push(commandSymbol);
        }
        if (SHOW_COMMAND_PATTERN.test(command)) {
          outputCandidate = {
            symbol: commandSymbol,
            scope: {
              symbols: commandSymbol?.children ?? symbols,
              categories: new Map(),
              interfaceBases: new Map(),
              parent: commandSymbol,
            },
            becameParent: false,
          };
        }
      }

      previousEnd = lineEnd;
      continue;
    }

    const startCharacter = skipLeadingWhitespace(line);
    if (line.length - startCharacter < 2) {
      previousEnd = lineEnd;
      continue;
    }
    const match = declarationMatch(line, startCharacter);
    if (!match) {
      previousEnd = lineEnd;
      continue;
    }
    if (isCancelled()) return [];

    if (match.category === 'address_family') {
      if (activeDeclaration?.kind === 'router_bgp') {
        if (outputCandidate) outputCandidate.becameParent = true;
        finish(activeAddressFamily, previousEnd);
        const scope = outputCandidate?.scope ?? rootScope;
        const router = activeDeclaration.symbol;
        const addressFamily =
          router && enabledCategories.address_family
            ? addDeclaration(scope, match, lineIndex, router)
            : undefined;
        activeAddressFamily = {
          kind: 'router_bgp',
          symbol: addressFamily,
          rangeParent: router,
        };
      }
      previousEnd = lineEnd;
      continue;
    }

    const scope = outputCandidate?.scope ?? rootScope;
    if (outputCandidate) outputCandidate.becameParent = true;
    closeDeclarations(previousEnd);
    let rangeParent: OutlineSymbol | undefined;
    let declaration: OutlineSymbol | undefined;

    if (match.category === 'sub_interface') {
      const dotIndex = match.name.lastIndexOf('.');
      const baseName = match.name.slice(0, dotIndex);
      const base = scope.interfaceBases.get(baseName);
      rangeParent = base;
      if (enabledCategories.sub_interface) {
        declaration = addDeclaration(scope, match, lineIndex, base);
      }
    } else if (enabledCategories[match.category]) {
      declaration = addDeclaration(scope, match, lineIndex);
    }

    activeDeclaration = {
      kind: match.category,
      symbol: declaration,
      rangeParent,
    };
    if (match.category === 'interface' && declaration) {
      scope.interfaceBases.set(match.name, declaration);
    }
    previousEnd = lineEnd;
  }

  closeDeclarations(previousEnd);
  closeOutput(previousEnd);
  return symbols;
};
