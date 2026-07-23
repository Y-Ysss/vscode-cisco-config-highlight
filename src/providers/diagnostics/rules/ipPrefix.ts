import type { LineSource } from '../../../parser/lineScanUtils';
import { parseDiagnosticCommand } from '../diagnosticCommand';
import type { DiagnosticLineContext } from '../diagnosticLineContext';
import { validatePrefixListModifiers } from './prefixListModifiers';
import type { RuleFinding, RuleFindingSeverity } from './ruleFinding';

interface Token {
  readonly text: string;
  readonly lower?: string;
  readonly start: number;
  readonly end: number;
}

export interface IpPrefixRuleOptions {
  readonly allowNonContiguousMask?: boolean;
}

const lower = (token: Token | undefined): string | undefined =>
  token?.lower ?? token?.text.toLowerCase();

/** Parses exactly four decimal IPv4 octets in the range 0..255. */
export const parseIpv4 = (
  text: string,
): readonly [number, number, number, number] | undefined => {
  const parts = text.split('.');
  if (parts.length !== 4) return undefined;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return undefined;
    const value = Number(part);
    if (!Number.isSafeInteger(value) || value > 255) return undefined;
    octets.push(value);
  }
  return [octets[0], octets[1], octets[2], octets[3]];
};

/** True when a valid IPv4 mask consists of ones followed only by zeroes. */
export const isContiguousSubnetMask = (
  octets: readonly [number, number, number, number],
): boolean => {
  let sawZero = false;
  for (const octet of octets) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      const isOne = (octet & (1 << bit)) !== 0;
      if (!isOne) sawZero = true;
      else if (sawZero) return false;
    }
  }
  return true;
};

const maskFromPrefix = (
  prefix: number,
): readonly [number, number, number, number] => {
  const octets = [0, 0, 0, 0];
  for (let index = 0; index < octets.length; index += 1) {
    const bits = Math.min(8, Math.max(0, prefix - index * 8));
    octets[index] = bits === 0 ? 0 : (0xff << (8 - bits)) & 0xff;
  }
  return [octets[0], octets[1], octets[2], octets[3]];
};

const prefixLengthFromMask = (
  mask: readonly [number, number, number, number],
): number => {
  let prefix = 0;
  for (const octet of mask) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      if ((octet & (1 << bit)) !== 0) prefix += 1;
    }
  }
  return prefix;
};

const minimumAlignedPrefix = (
  address: readonly [number, number, number, number],
): number => {
  let trailingZeroBits = 0;
  for (let index = address.length - 1; index >= 0; index -= 1) {
    let octet = address[index];
    if (octet === 0) {
      trailingZeroBits += 8;
      continue;
    }
    while ((octet & 1) === 0) {
      trailingZeroBits += 1;
      octet >>>= 1;
    }
    break;
  }
  return 32 - trailingZeroBits;
};

const pushFinding = (
  findings: RuleFinding[],
  line: number,
  range: Pick<Token, 'start' | 'end'>,
  code: string,
  message: string,
  severity: RuleFindingSeverity,
): void => {
  findings.push({
    line,
    start: range.start,
    end: range.end,
    code,
    message,
    severity,
  });
};

const validateAddress = (
  findings: RuleFinding[],
  line: number,
  token: Token,
): void => {
  if (!parseIpv4(token.text)) {
    pushFinding(
      findings,
      line,
      token,
      'invalid-ipv4',
      'Invalid IPv4 address.',
      'error',
    );
  }
};

interface NetworkBoundaryPresentation {
  readonly range: Pick<Token, 'start' | 'end'>;
  readonly message: (
    canonicalAddress: string,
    prefix: number,
    alignedPrefix: number,
    alignedMask: string,
  ) => string;
}

const validateNetworkBoundary = (
  findings: RuleFinding[],
  line: number,
  addressToken: Token,
  mask: readonly [number, number, number, number],
  presentation: NetworkBoundaryPresentation,
): void => {
  const address = parseIpv4(addressToken.text);
  if (!address || !isContiguousSubnetMask(mask)) return;

  const network = address.map((octet, index) => octet & mask[index]);
  if (network.every((octet, index) => octet === address[index])) return;

  const canonicalAddress = network.join('.');
  const prefix = prefixLengthFromMask(mask);
  const alignedPrefix = minimumAlignedPrefix(address);
  const alignedMask = maskFromPrefix(alignedPrefix).join('.');
  pushFinding(
    findings,
    line,
    presentation.range,
    'host-bits-set',
    presentation.message(canonicalAddress, prefix, alignedPrefix, alignedMask),
    'warning',
  );
};

const validateSubnetMask = (
  findings: RuleFinding[],
  line: number,
  token: Token,
  allowNonContiguousMask: boolean,
): void => {
  const mask = parseIpv4(token.text);
  if (!mask) {
    pushFinding(
      findings,
      line,
      token,
      'invalid-subnet-mask',
      'Invalid subnet mask.',
      'error',
    );
  } else if (!allowNonContiguousMask && !isContiguousSubnetMask(mask)) {
    pushFinding(
      findings,
      line,
      token,
      'non-contiguous-subnet-mask',
      'Subnet mask is not contiguous.',
      'warning',
    );
  }
};

const modifierWarning = (
  findings: RuleFinding[],
  line: number,
  token: Token,
): void =>
  pushFinding(
    findings,
    line,
    token,
    'invalid-prefix-list-modifier',
    'Invalid prefix-list modifier.',
    'warning',
  );

const validateModifiers = (
  findings: RuleFinding[],
  line: number,
  tokens: readonly Token[],
  prefix: number | undefined,
): void => {
  if (tokens.length === 0) return;

  const maskIndex = tokens.findIndex((token) => lower(token) === 'mask');
  if (maskIndex >= 0) {
    const mask = tokens[maskIndex + 1];
    if (mask && !parseIpv4(mask.text)) {
      pushFinding(
        findings,
        line,
        mask,
        'invalid-route-match-mask',
        'Invalid route-match mask.',
        'error',
      );
    }
    if (maskIndex !== 0 || !mask || tokens.length !== 2) {
      const relevant =
        maskIndex === 0 && tokens.length > 2 ? tokens[2] : tokens[maskIndex];
      modifierWarning(findings, line, relevant);
    }
    return;
  }

  validatePrefixListModifiers(findings, line, tokens, prefix, 32);
};

const validatePrefixList = (
  findings: RuleFinding[],
  line: number,
  tokens: readonly Token[],
): boolean => {
  if (lower(tokens[0]) !== 'ip' || lower(tokens[1]) !== 'prefix-list') {
    return false;
  }
  let index = 3;
  if (lower(tokens[index]) === 'seq') index += 2;
  const action = lower(tokens[index]);
  if (action !== 'permit' && action !== 'deny') return false;
  const operand = tokens[index + 1];
  if (!operand) return false;

  const slash = operand.text.indexOf('/');
  if (slash < 0) return false;
  const addressToken: Token = {
    text: operand.text.slice(0, slash),
    start: operand.start,
    end: operand.start + slash,
  };
  const prefixToken: Token = {
    text: operand.text.slice(slash + 1),
    start: operand.start + slash + 1,
    end: operand.end,
  };
  validateAddress(findings, line, addressToken);

  let prefix: number | undefined;
  if (!/^\d+$/.test(prefixToken.text)) {
    pushFinding(
      findings,
      line,
      prefixToken,
      'invalid-prefix-length',
      'Invalid IPv4 prefix length.',
      'warning',
    );
  } else {
    prefix = Number(prefixToken.text);
    if (prefix > 32) {
      pushFinding(
        findings,
        line,
        prefixToken,
        'invalid-prefix-length',
        'Invalid IPv4 prefix length.',
        'warning',
      );
    } else {
      validateNetworkBoundary(
        findings,
        line,
        addressToken,
        maskFromPrefix(prefix),
        {
          range: operand,
          message: (canonicalAddress, currentPrefix, alignedPrefix) =>
            `Not aligned to /${currentPrefix}. Use '${canonicalAddress}/${currentPrefix}' or '${addressToken.text}/${alignedPrefix}${alignedPrefix < 32 ? '+' : ''}'.`,
        },
      );
    }
  }
  validateModifiers(findings, line, tokens.slice(index + 2), prefix);
  return true;
};

const validateCandidate = (
  findings: RuleFinding[],
  line: number,
  tokens: readonly Token[],
  options: IpPrefixRuleOptions,
): boolean => {
  const first = lower(tokens[0]);
  if (first !== 'ip' && first !== 'network') return false;

  if (first === 'network') {
    if (lower(tokens[2]) !== 'mask' || !tokens[1] || !tokens[3]) return false;
    validateAddress(findings, line, tokens[1]);
    validateSubnetMask(
      findings,
      line,
      tokens[3],
      options.allowNonContiguousMask === true,
    );
    const mask = parseIpv4(tokens[3].text);
    if (mask) {
      validateNetworkBoundary(findings, line, tokens[1], mask, {
        range: { start: tokens[1].start, end: tokens[3].end },
        message: (canonicalAddress, _prefix, alignedPrefix, alignedMask) =>
          `Not aligned. Use '${canonicalAddress} mask ${tokens[3].text}' or '${tokens[1].text} mask ${alignedMask}'${alignedPrefix < 32 ? ' (or more specific)' : ''}.`,
      });
    }
    return true;
  }
  if (lower(tokens[1]) === 'prefix-list') {
    return validatePrefixList(findings, line, tokens);
  }
  if (lower(tokens[1]) !== 'route' && lower(tokens[1]) !== 'address') {
    return false;
  }
  if (!tokens[2] || !tokens[3]) return false;
  const addressKeyword = lower(tokens[2]);
  if (
    (lower(tokens[1]) === 'route' && addressKeyword === 'static') ||
    addressKeyword === 'vrf' ||
    addressKeyword === 'dhcp' ||
    addressKeyword === 'negotiated' ||
    addressKeyword === 'unnumbered'
  ) {
    return false;
  }
  validateAddress(findings, line, tokens[2]);
  validateSubnetMask(
    findings,
    line,
    tokens[3],
    options.allowNonContiguousMask === true,
  );
  if (lower(tokens[1]) === 'route') {
    const mask = parseIpv4(tokens[3].text);
    if (mask) {
      validateNetworkBoundary(findings, line, tokens[2], mask, {
        range: { start: tokens[2].start, end: tokens[3].end },
        message: (canonicalAddress, _prefix, alignedPrefix, alignedMask) =>
          `Not aligned. Use '${canonicalAddress} ${tokens[3].text}' or '${tokens[2].text} ${alignedMask}'${alignedPrefix < 32 ? ' (or more specific)' : ''}.`,
      });
    }
  }
  return true;
};

export const processIpPrefixCommand = (
  context: DiagnosticLineContext,
  options: IpPrefixRuleOptions = {},
): boolean => {
  const tokens = context.command.commandTokens;
  const first = lower(tokens[0]);
  if (first !== 'ip' && first !== 'network') return false;

  return validateCandidate(
    context.collect ? context.findings : [],
    context.line,
    tokens,
    options,
  );
};

/** Scans supported IPv4 prefix/mask command operands in one forward pass. */
export const scanIpPrefixFindings = (
  source: LineSource,
  options: IpPrefixRuleOptions = {},
  isCancelled: () => boolean = () => false,
): RuleFinding[] => {
  const findings: RuleFinding[] = [];
  for (let line = 0; line < source.lineCount; line += 1) {
    if ((line & 255) === 0 && isCancelled()) return [];
    const text = source.lineAt(line);
    const matched = processIpPrefixCommand(
      {
        line,
        command: parseDiagnosticCommand(text),
        collect: true,
        findings,
      },
      options,
    );
    if (matched && isCancelled()) {
      return [];
    }
  }
  return findings;
};
