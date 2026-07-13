import type { LineSource } from '../../../parser/lineScanUtils';
import { parseIpv4 } from './ipPrefix';
import type { RuleFinding } from './ruleFinding';

export type NamedAclKind = 'standard' | 'extended';
export type AclAction = 'permit' | 'deny';

export interface AclToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface AclWildcardCandidate {
  readonly line: number;
  readonly text: string;
  readonly kind: NamedAclKind;
  readonly action: AclAction;
  readonly sequence?: AclToken;
  readonly tokens: readonly AclToken[];
  /** Tokens after permit/deny, ready for Task 9's address validation. */
  readonly operands: readonly AclToken[];
}

const tokenize = (line: string): AclToken[] =>
  Array.from(line.matchAll(/[^ \t]+/g), (match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));

const normalized = (token: AclToken | undefined): string | undefined =>
  token?.text.toLowerCase();

const headerKind = (tokens: readonly AclToken[]): NamedAclKind | undefined => {
  if (
    tokens.length !== 4 ||
    normalized(tokens[0]) !== 'ip' ||
    normalized(tokens[1]) !== 'access-list'
  ) {
    return undefined;
  }
  const kind = normalized(tokens[2]);
  if (kind !== 'standard' && kind !== 'extended') return undefined;
  return kind;
};

const entryStart = (tokens: readonly AclToken[]): number =>
  tokens[0] && /^\d+$/.test(tokens[0].text) ? 1 : 0;

const candidateFor = (
  line: number,
  text: string,
  kind: NamedAclKind,
  tokens: readonly AclToken[],
): AclWildcardCandidate | undefined => {
  const start = entryStart(tokens);
  const action = normalized(tokens[start]);
  if (action !== 'permit' && action !== 'deny') return undefined;

  const operandCount = tokens.length - start - 1;
  if (
    (kind === 'standard' && operandCount < 1) ||
    (kind === 'extended' && operandCount < 3)
  ) {
    return undefined;
  }

  return {
    line,
    text,
    kind,
    action,
    sequence: start === 1 ? tokens[0] : undefined,
    tokens,
    operands: tokens.slice(start + 1),
  };
};

const numberedKind = (
  token: AclToken | undefined,
): NamedAclKind | undefined => {
  if (!token || !/^\d+$/.test(token.text)) return undefined;
  const id = Number(token.text);
  if ((id >= 1 && id <= 99) || (id >= 1300 && id <= 1999)) {
    return 'standard';
  }
  if ((id >= 100 && id <= 199) || (id >= 2000 && id <= 2699)) {
    return 'extended';
  }
  return undefined;
};

const numberedCandidateFor = (
  line: number,
  text: string,
  tokens: readonly AclToken[],
): AclWildcardCandidate | undefined => {
  if (normalized(tokens[0]) !== 'access-list') return undefined;
  const kind = numberedKind(tokens[1]);
  if (!kind) return undefined;
  return candidateFor(line, text, kind, tokens.slice(2));
};

const acceptedControl = (
  text: string,
  tokens: readonly AclToken[],
): 'continue' | 'exit' | undefined => {
  if (tokens.length === 0 || text.trimStart().startsWith('!'))
    return 'continue';
  const start = entryStart(tokens);
  const keyword = normalized(tokens[start]);
  if (keyword === 'remark') return 'continue';
  if (start === 0 && tokens.length === 1 && keyword === 'exit') return 'exit';
  return undefined;
};

/**
 * Extracts named IPv4 ACL entry candidates in one forward pass.
 *
 * No address or wildcard validity is decided here. A cancelled scan never
 * exposes partial results.
 */
export const scanAclWildcardCandidates = (
  source: LineSource,
  isCancelled: () => boolean = () => false,
): AclWildcardCandidate[] => {
  const candidates: AclWildcardCandidate[] = [];
  let activeKind: NamedAclKind | undefined;

  for (let lineIndex = 0; lineIndex < source.lineCount; lineIndex += 1) {
    if ((lineIndex & 255) === 0 && isCancelled()) return [];
    const text = source.lineAt(lineIndex);
    const tokens = tokenize(text);
    let reprocess = true;

    while (reprocess) {
      reprocess = false;
      if (activeKind) {
        const candidate = candidateFor(lineIndex, text, activeKind, tokens);
        if (candidate) {
          candidates.push(candidate);
          if (isCancelled()) return [];
          continue;
        }

        const control = acceptedControl(text, tokens);
        if (control) {
          if (isCancelled()) return [];
          if (control === 'exit') activeKind = undefined;
          continue;
        }

        activeKind = undefined;
        reprocess = true;
        continue;
      }

      const kind = headerKind(tokens);
      if (kind) {
        activeKind = kind;
        if (isCancelled()) return [];
        continue;
      }

      const numbered = numberedCandidateFor(lineIndex, text, tokens);
      if (numbered) {
        candidates.push(numbered);
        if (isCancelled()) return [];
      }
    }
  }

  return candidates;
};

interface AddressSpec {
  readonly address?: AclToken;
  readonly wildcard?: AclToken;
  readonly next: number;
}

const UNSUPPORTED_SPEC_STARTERS = new Set([
  'addrgroup',
  'interface',
  'object',
  'object-group',
  'security-group',
  'user-group',
]);

const GRAMMAR_BOUNDARIES = new Set([
  'ack',
  'administratively-prohibited',
  'dscp',
  'dynamic',
  'echo',
  'echo-reply',
  'eq',
  'evaluate',
  'established',
  'fin',
  'fragments',
  'gt',
  'host-unreachable',
  'inactive',
  'log',
  'log-input',
  'lt',
  'net-unreachable',
  'neq',
  'option',
  'packet-too-big',
  'port-unreachable',
  'precedence',
  'psh',
  'range',
  'reflect',
  'rst',
  'syn',
  'time-range',
  'time-exceeded',
  'tos',
  'traceroute',
  'ttl',
  'unreachable',
  'urg',
]);

const canStartRawAddress = (token: AclToken | undefined): token is AclToken => {
  const keyword = normalized(token);
  return (
    token !== undefined &&
    keyword !== undefined &&
    !UNSUPPORTED_SPEC_STARTERS.has(keyword) &&
    !GRAMMAR_BOUNDARIES.has(keyword)
  );
};

const canBeWildcard = (token: AclToken | undefined): token is AclToken => {
  const keyword = normalized(token);
  return canStartRawAddress(token) && keyword !== 'any' && keyword !== 'host';
};

/** Wildcard-consuming alternatives come first to make ambiguity deterministic. */
const addressAlternatives = (
  tokens: readonly AclToken[],
  index: number,
): AddressSpec[] => {
  const token = tokens[index];
  const keyword = normalized(token);
  if (keyword === 'any') return [{ next: index + 1 }];
  if (keyword === 'host') {
    const address = tokens[index + 1];
    return canStartRawAddress(address) ? [{ address, next: index + 2 }] : [];
  }
  if (!canStartRawAddress(token)) return [];

  const alternatives: AddressSpec[] = [];
  if (canBeWildcard(tokens[index + 1])) {
    alternatives.push({
      address: token,
      wildcard: tokens[index + 1],
      next: index + 2,
    });
  }
  alternatives.push({ address: token, next: index + 1 });
  return alternatives;
};

const portOperatorEnd = (
  tokens: readonly AclToken[],
  index: number,
): number | undefined => {
  const operator = normalized(tokens[index]);
  if (operator === 'range') {
    return tokens[index + 1] && tokens[index + 2] ? index + 3 : undefined;
  }
  if (
    operator === 'eq' ||
    operator === 'neq' ||
    operator === 'lt' ||
    operator === 'gt'
  ) {
    return tokens[index + 1] ? index + 2 : undefined;
  }
  return index;
};

const standardSpecs = (
  tokens: readonly AclToken[],
): readonly AddressSpec[] | undefined => {
  const alternatives = addressAlternatives(tokens, 0);
  return alternatives.length > 0 ? [alternatives[0]] : undefined;
};

const NAMED_PROTOCOLS = new Set([
  'ahp',
  'eigrp',
  'esp',
  'gre',
  'icmp',
  'igmp',
  'ip',
  'ipinip',
  'nos',
  'ospf',
  'pcp',
  'pim',
  'tcp',
  'udp',
]);

const isSupportedProtocol = (token: AclToken): boolean => {
  const value = normalized(token);
  if (value && NAMED_PROTOCOLS.has(value)) return true;
  if (!/^\d+$/.test(token.text)) return false;
  const number = Number(token.text);
  return number >= 0 && number <= 255;
};

const extendedSpecs = (
  tokens: readonly AclToken[],
): readonly AddressSpec[] | undefined => {
  if (!tokens[0] || !isSupportedProtocol(tokens[0])) return undefined;
  const sourceAlternatives = addressAlternatives(tokens, 1);
  for (const source of sourceAlternatives) {
    const destinationStart = portOperatorEnd(tokens, source.next);
    if (destinationStart === undefined) continue;
    for (const destination of addressAlternatives(tokens, destinationStart)) {
      const tailStart = portOperatorEnd(tokens, destination.next);
      if (tailStart !== undefined) return [source, destination];
    }
  }
  return undefined;
};

const pushInvalid = (
  findings: RuleFinding[],
  line: number,
  token: AclToken,
  wildcard: boolean,
): void => {
  findings.push({
    line,
    start: token.start,
    end: token.end,
    code: wildcard ? 'invalid-wildcard-mask' : 'invalid-ipv4',
    message: wildcard ? 'Invalid wildcard mask.' : 'Invalid IPv4 address.',
    severity: 'error',
  });
};

const ipv4ToUint32 = (
  octets: readonly [number, number, number, number],
): number =>
  ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;

const uint32ToIpv4 = (value: number): string =>
  [
    value >>> 24,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ].join('.');

const isCanonicalWildcard = (value: number): boolean =>
  (value & (value + 1)) === 0;

const isSubnetMask = (value: number): boolean => {
  const host = ~value >>> 0;
  return (host & (host + 1)) === 0;
};

const validateWildcardIntent = (
  findings: RuleFinding[],
  line: number,
  addressToken: AclToken,
  wildcardToken: AclToken,
  addressOctets: readonly [number, number, number, number],
  wildcardOctets: readonly [number, number, number, number],
): void => {
  const address = ipv4ToUint32(addressOctets);
  const wildcard = ipv4ToUint32(wildcardOctets);

  if (isSubnetMask(wildcard) && !isCanonicalWildcard(wildcard)) {
    const suggestion = uint32ToIpv4(~wildcard >>> 0);
    findings.push({
      line,
      start: wildcardToken.start,
      end: wildcardToken.end,
      code: 'subnet-mask-used-as-wildcard',
      message: `Wildcard looks like a subnet mask; use ${suggestion}.`,
      severity: 'warning',
    });
    return;
  }

  if ((address & wildcard) !== 0) {
    const canonicalAddress = uint32ToIpv4(address & ~wildcard);
    findings.push({
      line,
      start: addressToken.start,
      end: wildcardToken.end,
      code: 'non-canonical-wildcard-address',
      message: `Address has wildcard bits set; use ${canonicalAddress} ${wildcardToken.text}.`,
      severity: 'warning',
    });
  }
};

const validateCandidate = (
  findings: RuleFinding[],
  candidate: AclWildcardCandidate,
): void => {
  const specs =
    candidate.kind === 'standard'
      ? standardSpecs(candidate.operands)
      : extendedSpecs(candidate.operands);
  if (!specs) return;

  for (const spec of specs) {
    if (!spec.address) continue;

    const address = parseIpv4(spec.address.text);
    if (!address) {
      pushInvalid(findings, candidate.line, spec.address, false);
    }

    if (!spec.wildcard) continue;

    const wildcard = parseIpv4(spec.wildcard.text);
    if (!wildcard) {
      pushInvalid(findings, candidate.line, spec.wildcard, true);
    }

    if (address && wildcard) {
      validateWildcardIntent(
        findings,
        candidate.line,
        spec.address,
        spec.wildcard,
        address,
        wildcard,
      );
    }
  }
};

/** Validates supported IPv4 ACL address and wildcard operands in one scan. */
export const scanAclWildcardFindings = (
  source: LineSource,
  isCancelled: () => boolean = () => false,
): RuleFinding[] => {
  const candidates = scanAclWildcardCandidates(source, isCancelled);
  const findings: RuleFinding[] = [];
  for (const candidate of candidates) validateCandidate(findings, candidate);
  return findings;
};
