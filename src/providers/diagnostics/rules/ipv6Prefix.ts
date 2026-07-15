import type { LineSource } from '../../../parser/lineScanUtils';
import { parseDiagnosticCommand } from '../diagnosticCommand';
import type { DiagnosticLineContext } from '../diagnosticLineContext';
import { parseIpv4 } from './ipPrefix';
import {
  type PrefixListToken,
  validatePrefixListModifiers,
} from './prefixListModifiers';
import type { RuleFinding } from './ruleFinding';

type Token = PrefixListToken;

const lower = (token: Token | undefined): string | undefined =>
  token?.text.toLowerCase();

/** Parses IPv6 text, including a valid dotted-decimal IPv4 tail. */
export const parseIpv6 = (text: string): boolean => {
  if (text.length === 0 || text.includes('%')) return false;

  let normalized = text;
  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':');
    if (lastColon < 0 || !parseIpv4(text.slice(lastColon + 1))) return false;
    normalized = `${text.slice(0, lastColon + 1)}0:0`;
  }

  const compression = normalized.indexOf('::');
  if (compression !== normalized.lastIndexOf('::')) return false;
  const validHextet = (part: string): boolean =>
    /^[0-9a-fA-F]{1,4}$/.test(part);

  if (compression < 0) {
    const parts = normalized.split(':');
    return parts.length === 8 && parts.every(validHextet);
  }

  const left = normalized.slice(0, compression);
  const right = normalized.slice(compression + 2);
  const leftParts = left.length === 0 ? [] : left.split(':');
  const rightParts = right.length === 0 ? [] : right.split(':');
  return (
    leftParts.length + rightParts.length < 8 &&
    leftParts.every(validHextet) &&
    rightParts.every(validHextet)
  );
};

const pushInvalidAddress = (
  findings: RuleFinding[],
  line: number,
  token: Token,
): void => {
  if (parseIpv6(token.text)) return;
  findings.push({
    line,
    start: token.start,
    end: token.end,
    code: 'invalid-ipv6',
    message: 'Invalid IPv6 address.',
    severity: 'error',
  });
};

const validatePrefixOperand = (
  findings: RuleFinding[],
  line: number,
  operand: Token,
): number | undefined => {
  const slash = operand.text.indexOf('/');
  if (slash < 0) return undefined;
  const address: Token = {
    text: operand.text.slice(0, slash),
    start: operand.start,
    end: operand.start + slash,
  };
  const prefixToken: Token = {
    text: operand.text.slice(slash + 1),
    start: operand.start + slash + 1,
    end: operand.end,
  };
  pushInvalidAddress(findings, line, address);

  let prefix: number | undefined;
  if (/^\d+$/.test(prefixToken.text)) prefix = Number(prefixToken.text);
  if (prefix === undefined || prefix > 128) {
    findings.push({
      line,
      start: prefixToken.start,
      end: prefixToken.end,
      code: 'invalid-prefix-length',
      message: 'Invalid IPv6 prefix length.',
      severity: 'warning',
    });
  }
  return prefix;
};

const validatePrefixList = (
  findings: RuleFinding[],
  line: number,
  tokens: readonly Token[],
): boolean => {
  if (lower(tokens[0]) !== 'ipv6' || lower(tokens[1]) !== 'prefix-list') {
    return false;
  }
  let index = 3;
  if (lower(tokens[index]) === 'seq') index += 2;
  const action = lower(tokens[index]);
  if (action !== 'permit' && action !== 'deny') return false;
  const operand = tokens[index + 1];
  if (!operand || !operand.text.includes('/')) return false;
  const prefix = validatePrefixOperand(findings, line, operand);
  validatePrefixListModifiers(
    findings,
    line,
    tokens.slice(index + 2),
    prefix,
    128,
  );
  return true;
};

const validateStandalone = (
  findings: RuleFinding[],
  line: number,
  tokens: readonly Token[],
): boolean => {
  if (lower(tokens[0]) !== 'ipv6') return false;
  if (lower(tokens[1]) === 'prefix-list') {
    return validatePrefixList(findings, line, tokens);
  }
  if (lower(tokens[1]) !== 'address') return false;
  const operand = tokens[2];
  if (!operand || !operand.text.includes('/')) return false;
  validatePrefixOperand(findings, line, operand);
  return true;
};

interface AclOperand {
  readonly kind: 'any' | 'host' | 'prefix';
  readonly token?: Token;
  readonly next: number;
}

const readAclOperand = (
  tokens: readonly Token[],
  index: number,
): AclOperand | undefined => {
  if (lower(tokens[index]) === 'any') return { kind: 'any', next: index + 1 };
  if (lower(tokens[index]) === 'host' && tokens[index + 1]) {
    return { kind: 'host', token: tokens[index + 1], next: index + 2 };
  }
  if (tokens[index]?.text.includes('/')) {
    return { kind: 'prefix', token: tokens[index], next: index + 1 };
  }
  return undefined;
};

const skipPortOperator = (tokens: readonly Token[], index: number): number => {
  const operator = lower(tokens[index]);
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

const validateAclOperand = (
  findings: RuleFinding[],
  line: number,
  operand: AclOperand,
): void => {
  if (!operand.token) return;
  if (operand.kind === 'host')
    pushInvalidAddress(findings, line, operand.token);
  else validatePrefixOperand(findings, line, operand.token);
};

const validateAclMember = (
  findings: RuleFinding[],
  line: number,
  tokens: readonly Token[],
): boolean => {
  let index = 0;
  if (/^\d+$/.test(tokens[index]?.text ?? '')) index += 1;
  else if (lower(tokens[index]) === 'sequence' && tokens[index + 1]) index += 2;
  const action = lower(tokens[index]);
  if (action !== 'permit' && action !== 'deny') return false;
  if (!tokens[index + 1]) return false;

  const source = readAclOperand(tokens, index + 2);
  if (!source) return false;
  const destinationIndex = skipPortOperator(tokens, source.next);
  const destination = readAclOperand(tokens, destinationIndex);
  if (!destination) return false;

  validateAclOperand(findings, line, source);
  validateAclOperand(findings, line, destination);
  return true;
};

const isAclHeader = (tokens: readonly Token[]): boolean =>
  tokens.length === 3 &&
  lower(tokens[0]) === 'ipv6' &&
  lower(tokens[1]) === 'access-list' &&
  tokens[2] !== undefined;

export interface Ipv6ScanState {
  inAcl: boolean;
}

export const createIpv6ScanState = (): Ipv6ScanState => ({ inAcl: false });

const isNegatedSequenceDeletion = (
  context: DiagnosticLineContext,
  tokens: readonly Token[],
): boolean =>
  context.command.negated &&
  ((tokens.length === 1 && /^\d+$/.test(tokens[0]?.text ?? '')) ||
    (tokens.length === 2 &&
      lower(tokens[0]) === 'sequence' &&
      /^\d+$/.test(tokens[1]?.text ?? '')));

export const processIpv6Command = (
  state: Ipv6ScanState,
  context: DiagnosticLineContext,
): boolean => {
  const tokens = context.command.commandTokens;

  if (state.inAcl) {
    const first = lower(tokens[0]);
    let memberIndex = 0;
    if (/^\d+$/.test(tokens[0]?.text ?? '')) memberIndex = 1;
    else if (first === 'sequence' && tokens[1]) memberIndex = 2;
    const memberFirst = lower(tokens[memberIndex]);
    if (
      context.command.tokens.length === 0 ||
      context.command.text.trimStart().startsWith('!') ||
      memberFirst === 'remark' ||
      isNegatedSequenceDeletion(context, tokens)
    ) {
      return true;
    }
    if (!context.command.negated && first === 'exit') {
      state.inAcl = false;
      return true;
    }
    if (
      validateAclMember(
        context.collect ? context.findings : [],
        context.line,
        tokens,
      )
    ) {
      return true;
    }
    state.inAcl = false;
  }

  if (!context.command.negated && isAclHeader(tokens)) {
    state.inAcl = true;
    return true;
  }
  if (lower(tokens[0]) !== 'ipv6') return false;
  return validateStandalone(
    context.collect ? context.findings : [],
    context.line,
    tokens,
  );
};

/** Scans supported IPv6 prefix operands in one forward pass. */
export const scanIpv6PrefixFindings = (
  source: LineSource,
  isCancelled: () => boolean = () => false,
): RuleFinding[] => {
  const findings: RuleFinding[] = [];
  const state = createIpv6ScanState();

  for (let line = 0; line < source.lineCount; line += 1) {
    if ((line & 255) === 0 && isCancelled()) return [];
    const text = source.lineAt(line);
    const recognized = processIpv6Command(state, {
      line,
      command: parseDiagnosticCommand(text),
      collect: true,
      findings,
    });
    if (recognized && isCancelled()) return [];
  }
  return findings;
};
