import type { LineSource } from '../../../parser/lineScanUtils';

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

const IPV4_LEXICAL_PATTERN = /^\d+(?:\.\d+){3}$/;
const IPV6_LEXICAL_PATTERN = /^(?=[0-9a-f:.]*:)[0-9a-f:.]+$/i;

const isAddressLexicallyPlausible = (
  text: string,
  profile: Exclude<NetworkObjectGroupProfile, 'ios'>,
): boolean =>
  profile === 'nxos-ipv4'
    ? IPV4_LEXICAL_PATTERN.test(text)
    : IPV6_LEXICAL_PATTERN.test(text);

const isPrefixLexicallyPlausible = (
  text: string,
  profile: Exclude<NetworkObjectGroupProfile, 'ios'>,
): boolean => {
  const slash = text.indexOf('/');
  return (
    slash > 0 &&
    slash === text.lastIndexOf('/') &&
    /^\d+$/.test(text.slice(slash + 1)) &&
    isAddressLexicallyPlausible(text.slice(0, slash), profile)
  );
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
    isAddressLexicallyPlausible(memberTokens[1].text, profile)
  ) {
    memberKind = 'host';
    operands = memberTokens.slice(1);
  } else if (
    memberTokens.length === 1 &&
    isPrefixLexicallyPlausible(memberTokens[0].text, profile)
  ) {
    memberKind = 'prefix';
    operands = memberTokens;
  } else if (
    profile === 'nxos-ipv4' &&
    memberTokens.length === 2 &&
    memberTokens.every((token) => IPV4_LEXICAL_PATTERN.test(token.text))
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
