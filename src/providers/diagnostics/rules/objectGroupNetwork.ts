import type { LineSource } from '../../../parser/lineScanUtils';
import { isContiguousSubnetMask, parseIpv4 } from './ipPrefix';
import { parseIpv6 } from './ipv6Prefix';
import type { RuleFinding } from './ruleFinding';

export type NetworkObjectGroupProfile = 'ios' | 'nxos-ipv4' | 'nxos-ipv6';
export type NetworkObjectMemberKind =
  | 'network-object'
  | 'host'
  | 'prefix'
  | 'address-wildcard';

export interface NetworkObjectToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface NetworkObjectGroupCandidate {
  readonly line: number;
  readonly text: string;
  readonly profile: NetworkObjectGroupProfile;
  readonly memberKind: NetworkObjectMemberKind;
  readonly sequence?: NetworkObjectToken;
  readonly tokens: readonly NetworkObjectToken[];
  /** Member operands, excluding sequence and member keywords. */
  readonly operands: readonly NetworkObjectToken[];
}

const tokenize = (line: string): NetworkObjectToken[] =>
  Array.from(line.matchAll(/[^ \t]+/g), (match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));

const normalized = (
  token: NetworkObjectToken | undefined,
): string | undefined => token?.text.toLowerCase();

const headerProfile = (
  tokens: readonly NetworkObjectToken[],
): NetworkObjectGroupProfile | undefined => {
  if (normalized(tokens[0]) !== 'object-group') return undefined;
  if (tokens.length === 3 && normalized(tokens[1]) === 'network') return 'ios';
  if (
    tokens.length === 4 &&
    normalized(tokens[1]) === 'ip' &&
    normalized(tokens[2]) === 'address'
  ) {
    return 'nxos-ipv4';
  }
  if (
    tokens.length === 4 &&
    normalized(tokens[1]) === 'ipv6' &&
    normalized(tokens[2]) === 'address'
  ) {
    return 'nxos-ipv6';
  }
  return undefined;
};

const nxosStart = (tokens: readonly NetworkObjectToken[]): number =>
  tokens[0] && /^\d+$/.test(tokens[0].text) ? 1 : 0;

const isIpv4Like = (text: string): boolean =>
  text.includes('.') && /^[\d.]+$/.test(text);

const INCOMPLETE_VALUE_KEYWORDS = new Set([
  'description',
  'exit',
  'group-object',
  'host',
  'network-object',
  'object-group',
  'range',
]);

const isIncompleteValueKeyword = (
  token: NetworkObjectToken | undefined,
): boolean => {
  const keyword = normalized(token);
  return keyword !== undefined && INCOMPLETE_VALUE_KEYWORDS.has(keyword);
};

const candidateFor = (
  line: number,
  text: string,
  profile: NetworkObjectGroupProfile,
  tokens: readonly NetworkObjectToken[],
): NetworkObjectGroupCandidate | undefined => {
  if (profile === 'ios') {
    if (normalized(tokens[0]) !== 'network-object' || tokens.length < 2) {
      return undefined;
    }
    const firstOperand = tokens[1];
    const value =
      normalized(firstOperand) === 'host' ? tokens[2] : firstOperand;
    if (!value || isIncompleteValueKeyword(value)) return undefined;
    return {
      line,
      text,
      profile,
      memberKind: 'network-object',
      tokens,
      operands: tokens.slice(1),
    };
  }

  const start = nxosStart(tokens);
  const memberTokens = tokens.slice(start);
  let memberKind: NetworkObjectMemberKind;
  let operands: readonly NetworkObjectToken[];

  if (
    normalized(memberTokens[0]) === 'host' &&
    memberTokens.length === 2 &&
    !isIncompleteValueKeyword(memberTokens[1])
  ) {
    memberKind = 'host';
    operands = memberTokens.slice(1);
  } else if (memberTokens.length === 1 && memberTokens[0].text.includes('/')) {
    memberKind = 'prefix';
    operands = memberTokens;
  } else if (
    profile === 'nxos-ipv4' &&
    memberTokens.length === 2 &&
    memberTokens.some((token) => isIpv4Like(token.text))
  ) {
    memberKind = 'address-wildcard';
    operands = memberTokens;
  } else {
    return undefined;
  }

  return {
    line,
    text,
    profile,
    memberKind,
    sequence: start === 1 ? tokens[0] : undefined,
    tokens,
    operands,
  };
};

const acceptedControl = (
  text: string,
  profile: NetworkObjectGroupProfile,
  tokens: readonly NetworkObjectToken[],
): 'continue' | 'exit' | undefined => {
  if (tokens.length === 0 || text.trimStart().startsWith('!'))
    return 'continue';
  const start = profile === 'ios' ? 0 : nxosStart(tokens);
  const keyword = normalized(tokens[start]);
  if (keyword === 'description' || keyword === 'group-object')
    return 'continue';
  if (start === 0 && tokens.length === 1 && keyword === 'exit') return 'exit';
  return undefined;
};

/** Extracts network object-group members without validating address values. */
export const scanNetworkObjectGroupCandidates = (
  source: LineSource,
  isCancelled: () => boolean = () => false,
): NetworkObjectGroupCandidate[] => {
  const candidates: NetworkObjectGroupCandidate[] = [];
  let activeProfile: NetworkObjectGroupProfile | undefined;

  for (let lineIndex = 0; lineIndex < source.lineCount; lineIndex += 1) {
    if ((lineIndex & 255) === 0 && isCancelled()) return [];
    const text = source.lineAt(lineIndex);
    const tokens = tokenize(text);
    let reprocess = true;

    while (reprocess) {
      reprocess = false;
      if (activeProfile) {
        const control = acceptedControl(text, activeProfile, tokens);
        if (control) {
          if (isCancelled()) return [];
          if (control === 'exit') activeProfile = undefined;
          continue;
        }

        const candidate = candidateFor(lineIndex, text, activeProfile, tokens);
        if (candidate) {
          candidates.push(candidate);
          if (isCancelled()) return [];
          continue;
        }

        activeProfile = undefined;
        reprocess = true;
        continue;
      }

      const profile = headerProfile(tokens);
      if (profile) {
        activeProfile = profile;
        if (isCancelled()) return [];
      }
    }
  }

  return candidates;
};

export interface NetworkObjectGroupRuleOptions {
  readonly allowNonContiguousMask?: boolean;
}

const pushFinding = (
  findings: RuleFinding[],
  line: number,
  token: Pick<NetworkObjectToken, 'start' | 'end'>,
  code: string,
  message: string,
  severity: RuleFinding['severity'],
): void => {
  findings.push({
    line,
    start: token.start,
    end: token.end,
    code,
    message,
    severity,
  });
};

const validateIpv4 = (
  findings: RuleFinding[],
  line: number,
  token: NetworkObjectToken,
): void => {
  if (parseIpv4(token.text)) return;
  pushFinding(
    findings,
    line,
    token,
    'invalid-ipv4',
    'Invalid IPv4 address.',
    'error',
  );
};

const validateIpv6 = (
  findings: RuleFinding[],
  line: number,
  token: NetworkObjectToken,
): void => {
  if (parseIpv6(token.text)) return;
  pushFinding(
    findings,
    line,
    token,
    'invalid-ipv6',
    'Invalid IPv6 address.',
    'error',
  );
};

const validatePrefix = (
  findings: RuleFinding[],
  line: number,
  token: NetworkObjectToken,
  profile: Exclude<NetworkObjectGroupProfile, 'ios'>,
): void => {
  const slash = token.text.indexOf('/');
  const address: NetworkObjectToken = {
    text: token.text.slice(0, slash),
    start: token.start,
    end: token.start + slash,
  };
  const prefix: NetworkObjectToken = {
    text: token.text.slice(slash + 1),
    start: token.start + slash + 1,
    end: token.end,
  };
  if (profile === 'nxos-ipv4') validateIpv4(findings, line, address);
  else validateIpv6(findings, line, address);

  const maximum = profile === 'nxos-ipv4' ? 32 : 128;
  const value = /^\d+$/.test(prefix.text) ? Number(prefix.text) : undefined;
  if (value === undefined || value > maximum) {
    pushFinding(
      findings,
      line,
      prefix,
      'invalid-prefix-length',
      `Invalid ${profile === 'nxos-ipv4' ? 'IPv4' : 'IPv6'} prefix length.`,
      'warning',
    );
  }
};

const validateIosCandidate = (
  findings: RuleFinding[],
  candidate: NetworkObjectGroupCandidate,
  options: NetworkObjectGroupRuleOptions,
): void => {
  const operands = candidate.operands;
  if (normalized(operands[0]) === 'host') {
    if (operands[1]) validateIpv4(findings, candidate.line, operands[1]);
    return;
  }

  const address = operands[0];
  if (address) validateIpv4(findings, candidate.line, address);
  const maskToken = operands[1];
  if (!maskToken) return;
  const mask = parseIpv4(maskToken.text);
  if (!mask) {
    pushFinding(
      findings,
      candidate.line,
      maskToken,
      'invalid-subnet-mask',
      'Invalid subnet mask.',
      'error',
    );
  } else if (
    options.allowNonContiguousMask !== true &&
    !isContiguousSubnetMask(mask)
  ) {
    pushFinding(
      findings,
      candidate.line,
      maskToken,
      'non-contiguous-subnet-mask',
      'Subnet mask is not contiguous.',
      'warning',
    );
  }
};

const validateCandidate = (
  findings: RuleFinding[],
  candidate: NetworkObjectGroupCandidate,
  options: NetworkObjectGroupRuleOptions,
): void => {
  if (candidate.profile === 'ios') {
    validateIosCandidate(findings, candidate, options);
    return;
  }
  if (candidate.memberKind === 'prefix') {
    validatePrefix(
      findings,
      candidate.line,
      candidate.operands[0],
      candidate.profile,
    );
    return;
  }
  if (candidate.memberKind === 'host') {
    const address = candidate.operands[0];
    if (candidate.profile === 'nxos-ipv4') {
      validateIpv4(findings, candidate.line, address);
    } else {
      validateIpv6(findings, candidate.line, address);
    }
    return;
  }

  validateIpv4(findings, candidate.line, candidate.operands[0]);
  const wildcard = candidate.operands[1];
  if (!parseIpv4(wildcard.text)) {
    pushFinding(
      findings,
      candidate.line,
      wildcard,
      'invalid-wildcard-mask',
      'Invalid wildcard mask.',
      'error',
    );
  }
};

/** Validates supported network object-group values from same-pass candidates. */
export const scanNetworkObjectGroupFindings = (
  source: LineSource,
  options: NetworkObjectGroupRuleOptions = {},
  isCancelled: () => boolean = () => false,
): RuleFinding[] => {
  const candidates = scanNetworkObjectGroupCandidates(source, isCancelled);
  const findings: RuleFinding[] = [];
  for (const candidate of candidates) {
    validateCandidate(findings, candidate, options);
    if (isCancelled()) return [];
  }
  return findings;
};
