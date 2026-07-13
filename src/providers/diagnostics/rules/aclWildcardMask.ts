import type { LineSource } from '../../../parser/lineScanUtils';

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
      }
    }
  }

  return candidates;
};
