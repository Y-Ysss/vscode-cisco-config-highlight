import type { LineSource } from '../../parser/lineScanUtils';
import { scanAclWildcardFindings } from './rules/aclWildcardMask';
import { scanIpPrefixFindings } from './rules/ipPrefix';
import { scanIpv6PrefixFindings } from './rules/ipv6Prefix';
import { scanNetworkObjectGroupFindings } from './rules/objectGroupNetwork';
import type { RuleFinding } from './rules/ruleFinding';

export interface DiagnosticsLineRange {
  readonly start: number;
  readonly end: number;
}

export interface DiagnosticsScanOptions {
  readonly allowNonContiguousMask?: boolean;
  /** Omit to validate every line. State is tracked outside included ranges. */
  readonly includedRanges?: readonly DiagnosticsLineRange[];
}

interface ScanState {
  ipv4AclHeader?: string;
  ipv4AclKind?: 'standard' | 'extended';
  ipv6AclHeader?: string;
  objectGroupHeader?: string;
  objectGroupProfile?: 'ios' | 'nxos-ipv4' | 'nxos-ipv6';
}

interface Token {
  readonly text: string;
  readonly lower: string;
}

const tokensOf = (text: string): Token[] =>
  Array.from(text.matchAll(/[^ \t]+/g), (match) => ({
    text: match[0],
    lower: match[0].toLowerCase(),
  }));

const smallSource = (...lines: string[]): LineSource => ({
  lineCount: lines.length,
  lineAt: (line) => lines[line],
});

const appendOffset = (
  findings: RuleFinding[],
  scanned: readonly RuleFinding[],
  offset: number,
): void => {
  for (const finding of scanned) {
    findings.push({ ...finding, line: finding.line + offset });
  }
};

const isIncluded = (
  line: number,
  ranges: readonly DiagnosticsLineRange[] | undefined,
): boolean =>
  ranges === undefined ||
  ranges.some((range) => line >= range.start && line <= range.end);

const ipv4AclHeaderKind = (
  tokens: readonly Token[],
): 'standard' | 'extended' | undefined => {
  if (
    tokens.length !== 4 ||
    tokens[0]?.lower !== 'ip' ||
    tokens[1]?.lower !== 'access-list'
  ) {
    return undefined;
  }
  const kind = tokens[2]?.lower;
  return kind === 'standard' || kind === 'extended' ? kind : undefined;
};

const memberStart = (tokens: readonly Token[]): number =>
  /^\d+$/.test(tokens[0]?.text ?? '') ? 1 : 0;

const isIpv4AclMember = (
  tokens: readonly Token[],
  kind: 'standard' | 'extended',
): boolean => {
  const start = memberStart(tokens);
  const action = tokens[start]?.lower;
  if (action !== 'permit' && action !== 'deny') return false;
  const operandCount = tokens.length - start - 1;
  return kind === 'standard' ? operandCount >= 1 : operandCount >= 3;
};

const isIpv4AclControl = (text: string, tokens: readonly Token[]): boolean => {
  if (tokens.length === 0 || text.trimStart().startsWith('!')) return true;
  const start = memberStart(tokens);
  return tokens[start]?.lower === 'remark';
};

const ipv6MemberStart = (tokens: readonly Token[]): number => {
  if (/^\d+$/.test(tokens[0]?.text ?? '')) return 1;
  return tokens[0]?.lower === 'sequence' && tokens[1] ? 2 : 0;
};

const ipv6OperandEnd = (
  tokens: readonly Token[],
  index: number,
): number | undefined => {
  if (tokens[index]?.lower === 'any') return index + 1;
  if (tokens[index]?.lower === 'host' && tokens[index + 1]) return index + 2;
  return tokens[index]?.text.includes('/') ? index + 1 : undefined;
};

const skipPort = (tokens: readonly Token[], index: number): number => {
  const operator = tokens[index]?.lower;
  if (operator === 'range') return index + 3;
  if (
    operator === 'eq' ||
    operator === 'neq' ||
    operator === 'lt' ||
    operator === 'gt'
  ) {
    return index + 2;
  }
  return index;
};

const isIpv6AclMember = (tokens: readonly Token[]): boolean => {
  const start = ipv6MemberStart(tokens);
  const action = tokens[start]?.lower;
  if ((action !== 'permit' && action !== 'deny') || !tokens[start + 1]) {
    return false;
  }
  const sourceEnd = ipv6OperandEnd(tokens, start + 2);
  return (
    sourceEnd !== undefined &&
    ipv6OperandEnd(tokens, skipPort(tokens, sourceEnd)) !== undefined
  );
};

const isIpv6AclControl = (tokens: readonly Token[]): boolean => {
  const start = ipv6MemberStart(tokens);
  return (
    tokens.length === 0 ||
    tokens[0]?.lower === '!' ||
    tokens[start]?.lower === 'remark'
  );
};

const objectGroupProfile = (
  tokens: readonly Token[],
): ScanState['objectGroupProfile'] => {
  if (tokens[0]?.lower !== 'object-group') return undefined;
  if (tokens.length === 3 && tokens[1]?.lower === 'network') return 'ios';
  if (
    tokens.length === 4 &&
    tokens[1]?.lower === 'ip' &&
    tokens[2]?.lower === 'address'
  ) {
    return 'nxos-ipv4';
  }
  if (
    tokens.length === 4 &&
    tokens[1]?.lower === 'ipv6' &&
    tokens[2]?.lower === 'address'
  ) {
    return 'nxos-ipv6';
  }
  return undefined;
};

const nxosStart = (tokens: readonly Token[]): number =>
  /^\d+$/.test(tokens[0]?.text ?? '') ? 1 : 0;

const isObjectGroupControl = (
  text: string,
  tokens: readonly Token[],
  profile: NonNullable<ScanState['objectGroupProfile']>,
): boolean => {
  if (tokens.length === 0 || text.trimStart().startsWith('!')) return true;
  const start = profile === 'ios' ? 0 : nxosStart(tokens);
  const keyword = tokens[start]?.lower;
  return keyword === 'description' || keyword === 'group-object';
};

const INCOMPLETE_OBJECT_VALUES = new Set([
  'description',
  'exit',
  'group-object',
  'host',
  'network-object',
  'object-group',
  'range',
]);

const isObjectGroupMember = (
  tokens: readonly Token[],
  profile: NonNullable<ScanState['objectGroupProfile']>,
): boolean => {
  if (profile === 'ios') {
    if (tokens[0]?.lower !== 'network-object' || tokens.length < 2) {
      return false;
    }
    const value = tokens[1]?.lower === 'host' ? tokens[2] : tokens[1];
    return value !== undefined && !INCOMPLETE_OBJECT_VALUES.has(value.lower);
  }
  const members = tokens.slice(nxosStart(tokens));
  if (
    members[0]?.lower === 'host' &&
    members.length === 2 &&
    !INCOMPLETE_OBJECT_VALUES.has(members[1].lower)
  ) {
    return true;
  }
  if (members.length === 1 && members[0]?.text.includes('/')) return true;
  return (
    profile === 'nxos-ipv4' &&
    members.length === 2 &&
    members.some(({ text }) => text.includes('.') && /^[\d.]+$/.test(text))
  );
};

const processLine = (
  state: ScanState,
  findings: RuleFinding[],
  line: number,
  text: string,
  options: DiagnosticsScanOptions,
): void => {
  const tokens = tokensOf(text);
  const collect = isIncluded(line, options.includedRanges);
  const first = tokens[0]?.lower;

  if (collect && (first === 'ip' || first === 'network')) {
    appendOffset(
      findings,
      scanIpPrefixFindings(smallSource(text), {
        allowNonContiguousMask: options.allowNonContiguousMask,
      }),
      line,
    );
  }

  if (state.ipv4AclKind && state.ipv4AclHeader) {
    if (isIpv4AclMember(tokens, state.ipv4AclKind)) {
      if (collect) {
        appendOffset(
          findings,
          scanAclWildcardFindings(smallSource(state.ipv4AclHeader, text)),
          line - 1,
        );
      }
    } else if (tokens.length === 1 && first === 'exit') {
      state.ipv4AclKind = undefined;
      state.ipv4AclHeader = undefined;
    } else if (!isIpv4AclControl(text, tokens)) {
      state.ipv4AclKind = undefined;
      state.ipv4AclHeader = undefined;
    }
  }
  if (!state.ipv4AclKind) {
    const kind = ipv4AclHeaderKind(tokens);
    if (kind) {
      state.ipv4AclKind = kind;
      state.ipv4AclHeader = text;
    } else if (collect && first === 'access-list') {
      appendOffset(findings, scanAclWildcardFindings(smallSource(text)), line);
    }
  }

  if (state.ipv6AclHeader) {
    if (isIpv6AclMember(tokens)) {
      if (collect) {
        appendOffset(
          findings,
          scanIpv6PrefixFindings(smallSource(state.ipv6AclHeader, text)),
          line - 1,
        );
      }
    } else if (tokens.length === 1 && first === 'exit') {
      state.ipv6AclHeader = undefined;
    } else if (!isIpv6AclControl(tokens)) {
      state.ipv6AclHeader = undefined;
    }
  }
  if (!state.ipv6AclHeader) {
    const isHeader =
      tokens.length === 3 &&
      first === 'ipv6' &&
      tokens[1]?.lower === 'access-list';
    if (isHeader) state.ipv6AclHeader = text;
    else if (collect && first === 'ipv6') {
      appendOffset(findings, scanIpv6PrefixFindings(smallSource(text)), line);
    }
  }

  if (state.objectGroupProfile && state.objectGroupHeader) {
    if (isObjectGroupMember(tokens, state.objectGroupProfile)) {
      if (collect) {
        appendOffset(
          findings,
          scanNetworkObjectGroupFindings(
            smallSource(state.objectGroupHeader, text),
            { allowNonContiguousMask: options.allowNonContiguousMask },
          ),
          line - 1,
        );
      }
    } else if (tokens.length === 1 && first === 'exit') {
      state.objectGroupProfile = undefined;
      state.objectGroupHeader = undefined;
    } else if (!isObjectGroupControl(text, tokens, state.objectGroupProfile)) {
      state.objectGroupProfile = undefined;
      state.objectGroupHeader = undefined;
    }
  }
  if (!state.objectGroupProfile) {
    const profile = objectGroupProfile(tokens);
    if (profile) {
      state.objectGroupProfile = profile;
      state.objectGroupHeader = text;
    }
  }
};

const finish = (findings: RuleFinding[]): RuleFinding[] => {
  findings.sort(
    (left, right) => left.line - right.line || left.start - right.start,
  );
  return findings;
};

export const scanDiagnosticFindings = (
  source: LineSource,
  options: DiagnosticsScanOptions = {},
  isCancelled: () => boolean = () => false,
): RuleFinding[] => {
  const state: ScanState = {};
  const findings: RuleFinding[] = [];
  for (let line = 0; line < source.lineCount; line += 1) {
    if ((line & 255) === 0 && isCancelled()) return [];
    processLine(state, findings, line, source.lineAt(line), options);
    if (isCancelled()) return [];
  }
  return finish(findings);
};

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

export const scanDiagnosticFindingsAsync = async (
  source: LineSource,
  options: DiagnosticsScanOptions = {},
  isCancelled: () => boolean = () => false,
): Promise<RuleFinding[] | null> => {
  const state: ScanState = {};
  const findings: RuleFinding[] = [];
  for (let line = 0; line < source.lineCount; line += 1) {
    if ((line & 255) === 0) {
      if (isCancelled()) return null;
      if (line > 0) await yieldToEventLoop();
      if (isCancelled()) return null;
    }
    processLine(state, findings, line, source.lineAt(line), options);
    if (isCancelled()) return null;
  }
  return finish(findings);
};
