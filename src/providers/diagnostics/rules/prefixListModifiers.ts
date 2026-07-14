import type { RuleFinding } from './ruleFinding';

export interface PrefixListToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const lower = (token: PrefixListToken | undefined): string | undefined =>
  token?.text.toLowerCase();

const warn = (
  findings: RuleFinding[],
  line: number,
  token: PrefixListToken,
): void => {
  findings.push({
    line,
    start: token.start,
    end: token.end,
    code: 'invalid-prefix-list-modifier',
    message: 'Invalid prefix-list modifier.',
    severity: 'warning',
  });
};

/** Validates eq/ge/le prefix-list grammar against a caller-supplied maximum. */
export const validatePrefixListModifiers = (
  findings: RuleFinding[],
  line: number,
  tokens: readonly PrefixListToken[],
  prefix: number | undefined,
  maximum: number,
): void => {
  if (tokens.length === 0) return;

  const pairs: Array<{
    keyword: PrefixListToken;
    value: PrefixListToken;
    number: number;
  }> = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const keyword = tokens[index];
    const value = tokens[index + 1];
    const name = lower(keyword);
    if (name !== 'eq' && name !== 'ge' && name !== 'le') {
      warn(findings, line, keyword);
      continue;
    }
    if (!value) {
      warn(findings, line, keyword);
      continue;
    }
    if (!/^\d+$/.test(value.text)) {
      warn(findings, line, value);
      continue;
    }
    pairs.push({ keyword, value, number: Number(value.text) });
  }

  if (pairs.length * 2 !== tokens.length) return;
  const names = pairs.map(({ keyword }) => lower(keyword));
  const grammarIsValid =
    (names.length === 1 &&
      (names[0] === 'eq' || names[0] === 'ge' || names[0] === 'le')) ||
    (names.length === 2 && names[0] === 'ge' && names[1] === 'le');
  if (!grammarIsValid) {
    const duplicateOrOutOfOrder = pairs.find(
      ({ keyword }, index) =>
        index > 0 &&
        (lower(keyword) === lower(pairs[index - 1].keyword) ||
          lower(pairs[index - 1].keyword) !== 'ge' ||
          lower(keyword) !== 'le'),
    );
    warn(findings, line, duplicateOrOutOfOrder?.keyword ?? pairs[0].keyword);
    return;
  }

  const warnedValues = new Set<PrefixListToken>();
  const warnValue = (value: PrefixListToken): void => {
    if (warnedValues.has(value)) return;
    warnedValues.add(value);
    warn(findings, line, value);
  };
  for (const pair of pairs) {
    if (pair.number > maximum) warnValue(pair.value);
  }
  if (prefix !== undefined) {
    const invalidPair = pairs.find(({ number }) => number <= prefix);
    if (invalidPair) warnValue(invalidPair.value);
  }
  if (pairs.length === 2 && pairs[0].number > pairs[1].number) {
    warnValue(pairs[1].value);
  }
};
