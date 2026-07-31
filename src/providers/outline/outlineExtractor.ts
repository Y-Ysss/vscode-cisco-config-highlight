import { skipLeadingWhitespace } from '../../parser/lineScanUtils';
import {
  isConfigurationShowCommand,
  isShowCommand,
  matchDeclaration,
  PROMPT_PATTERN,
} from './declarationMatcher';
import { type OutlineScope, OutlineTreeBuilder } from './outlineTreeBuilder';
import type {
  EnabledOutlineCategories,
  LineSource,
  OutlineCategory,
  OutlinePosition,
  OutlineRange,
  OutlineSymbol,
} from './outlineTypes';

export { measureOutlineDocument } from './documentMeasurement';
export * from './outlineTypes';

interface ActiveDeclaration {
  kind: Exclude<
    OutlineCategory,
    'command' | 'address_family' | 'policy_class' | 'access_list_entry'
  >;
  symbol?: OutlineSymbol;
  rangeParent?: OutlineSymbol;
  acceptsNestedEntries?: boolean;
}

interface OutputCandidate {
  symbol?: OutlineSymbol;
  scope: OutlineScope;
}

export const extractOutlineSymbols = (
  source: LineSource,
  enabledCategories: EnabledOutlineCategories,
  isCancelled: () => boolean = () => false,
  isTruncated = false,
): OutlineSymbol[] => {
  const tree = new OutlineTreeBuilder();
  let rootScope = tree.createRootScope();
  let outputCandidate: OutputCandidate | undefined;
  let activeDeclaration: ActiveDeclaration | undefined;
  let activeNestedDeclaration: ActiveDeclaration | undefined;
  let previousEnd: OutlinePosition = { line: 0, character: 0 };

  const finish = (
    active: ActiveDeclaration | undefined,
    end: OutlinePosition,
  ): void => {
    if (active?.symbol) tree.extendRange(active.symbol, end);
    else if (active?.rangeParent) tree.extendRange(active.rangeParent, end);
  };

  const closeDeclarations = (end: OutlinePosition): void => {
    finish(activeNestedDeclaration, end);
    finish(activeDeclaration, end);
    activeNestedDeclaration = undefined;
    activeDeclaration = undefined;
  };

  const closeOutput = (end: OutlinePosition): void => {
    if (outputCandidate?.symbol) tree.extendRange(outputCandidate.symbol, end);
    outputCandidate = undefined;
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

      const rawCommand = promptMatch.groups.command;
      const command = rawCommand.trim();
      const commandStart =
        line.length - rawCommand.length + skipLeadingWhitespace(rawCommand);
      const isConfigurationMode = promptMatch.groups.mode
        ?.toLowerCase()
        .startsWith('config');
      const isOutputCommand = isConfigurationShowCommand(command);

      closeDeclarations(previousEnd);
      closeOutput(previousEnd);
      rootScope = tree.createRootScope();
      if ((isConfigurationMode && !isOutputCommand) || command.length === 0) {
        previousEnd = lineEnd;
        continue;
      }

      const selectionRange: OutlineRange = {
        start: { line: lineIndex, character: commandStart },
        end: { line: lineIndex, character: line.trimEnd().length },
      };
      const commandSymbol = enabledCategories.command
        ? tree.makeSymbol(
            'command',
            'command',
            command,
            'command',
            selectionRange,
          )
        : undefined;
      if (commandSymbol) {
        commandSymbol.range.start = { line: lineIndex, character: 0 };
        tree.symbols.push(commandSymbol);
      }
      if (isShowCommand(command)) {
        outputCandidate = {
          symbol: commandSymbol,
          scope: tree.createOutputScope(commandSymbol),
        };
      }
      previousEnd = lineEnd;
      continue;
    }

    const startCharacter = skipLeadingWhitespace(line);
    if (line.length - startCharacter < 2) {
      previousEnd = lineEnd;
      continue;
    }
    const match = matchDeclaration(line, startCharacter);
    if (!match) {
      previousEnd = lineEnd;
      continue;
    }
    if (isCancelled()) return [];

    if (
      match.category === 'address_family' ||
      match.category === 'policy_class' ||
      match.category === 'access_list_entry'
    ) {
      const parentKind =
        match.category === 'address_family'
          ? 'router_bgp'
          : match.category === 'policy_class'
            ? 'policy_map'
            : 'ip_access_list';
      const acceptsEntry =
        match.category !== 'access_list_entry' ||
        activeDeclaration?.acceptsNestedEntries;
      if (activeDeclaration?.kind === parentKind && acceptsEntry) {
        finish(activeNestedDeclaration, previousEnd);
        const scope = outputCandidate?.scope ?? rootScope;
        const parent = activeDeclaration.symbol;
        const child =
          parent && enabledCategories[match.category]
            ? tree.addDeclaration(scope, match, lineIndex, parent)
            : undefined;
        activeNestedDeclaration = {
          kind: parentKind,
          symbol: child,
          rangeParent: parent,
        };
      }
      previousEnd = lineEnd;
      continue;
    }

    const scope = outputCandidate?.scope ?? rootScope;
    tree.startCategory(scope, match.category);
    closeDeclarations(previousEnd);
    let rangeParent: OutlineSymbol | undefined;
    let declaration: OutlineSymbol | undefined;

    if (match.category === 'sub_interface') {
      const dotIndex = match.name.lastIndexOf('.');
      const baseName = match.name.slice(0, dotIndex);
      const base = scope.interfaceBases.get(baseName);
      rangeParent = base;
      if (enabledCategories.sub_interface) {
        declaration = tree.addDeclaration(scope, match, lineIndex, base);
      }
    } else if (
      match.category === 'ip_prefix_list' &&
      enabledCategories.ip_prefix_list
    ) {
      let prefixList = scope.ipPrefixLists.get(match.name);
      if (!prefixList) {
        prefixList = tree.addDeclaration(scope, match, lineIndex);
        scope.ipPrefixLists.set(match.name, prefixList);
      }
      declaration = match.childName
        ? tree.addDeclaration(
            scope,
            {
              ...match,
              name: match.childName,
              childName: undefined,
              detail: 'prefix-list entry',
            },
            lineIndex,
            prefixList,
          )
        : prefixList;
    } else if (
      match.category === 'ip_access_list' &&
      enabledCategories.ip_access_list
    ) {
      if (match.childName) {
        const key = `${match.detail}:${match.name}`;
        let accessList = scope.accessLists.get(key);
        if (!accessList) {
          accessList = tree.addDeclaration(
            scope,
            { ...match, childName: undefined },
            lineIndex,
          );
          scope.accessLists.set(key, accessList);
        }
        if (enabledCategories.access_list_entry) {
          declaration = tree.addDeclaration(
            scope,
            {
              ...match,
              category: 'access_list_entry',
              name: match.childName,
              childName: undefined,
              detail: 'access-list entry',
            },
            lineIndex,
            accessList,
          );
        } else {
          rangeParent = accessList;
        }
      } else {
        declaration = tree.addDeclaration(scope, match, lineIndex);
      }
    } else if (enabledCategories[match.category]) {
      declaration = tree.addDeclaration(scope, match, lineIndex);
    }

    activeDeclaration = {
      kind: match.category,
      symbol: declaration,
      rangeParent,
      acceptsNestedEntries:
        match.category === 'ip_access_list' && match.childName === undefined,
    };
    if (match.category === 'interface' && declaration) {
      scope.interfaceBases.set(match.name, declaration);
    }
    previousEnd = lineEnd;
  }

  closeDeclarations(previousEnd);
  closeOutput(previousEnd);
  if (isCancelled()) return [];
  if (isTruncated && source.lineCount > 0) {
    const finalLineRange: OutlineRange = {
      start: { line: previousEnd.line, character: 0 },
      end: { ...previousEnd },
    };
    tree.symbols.push({
      category: 'truncation',
      type: 'truncation',
      name: 'Truncated output (see settings for max output size)',
      detail: '',
      range: finalLineRange,
      selectionRange: {
        start: { ...finalLineRange.start },
        end: { ...finalLineRange.end },
      },
      children: [],
    });
  }
  return tree.symbols;
};
