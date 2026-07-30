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
  kind: Exclude<OutlineCategory, 'command' | 'address_family'>;
  symbol?: OutlineSymbol;
  rangeParent?: OutlineSymbol;
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
  let activeAddressFamily: ActiveDeclaration | undefined;
  let previousEnd: OutlinePosition = { line: 0, character: 0 };

  const finish = (
    active: ActiveDeclaration | undefined,
    end: OutlinePosition,
  ): void => {
    if (active?.symbol) tree.extendRange(active.symbol, end);
    else if (active?.rangeParent) tree.extendRange(active.rangeParent, end);
  };

  const closeDeclarations = (end: OutlinePosition): void => {
    finish(activeAddressFamily, end);
    finish(activeDeclaration, end);
    activeAddressFamily = undefined;
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

    if (match.category === 'address_family') {
      if (activeDeclaration?.kind === 'router_bgp') {
        finish(activeAddressFamily, previousEnd);
        const scope = outputCandidate?.scope ?? rootScope;
        const router = activeDeclaration.symbol;
        const addressFamily =
          router && enabledCategories.address_family
            ? tree.addDeclaration(scope, match, lineIndex, router)
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
    } else if (enabledCategories[match.category]) {
      declaration = tree.addDeclaration(scope, match, lineIndex);
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
