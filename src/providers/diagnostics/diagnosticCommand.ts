export interface DiagnosticToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface DiagnosticCommand {
  readonly text: string;
  readonly tokens: readonly DiagnosticToken[];
  readonly commandTokens: readonly DiagnosticToken[];
  readonly negated: boolean;
}

export const parseDiagnosticCommand = (text: string): DiagnosticCommand => {
  const tokens = Array.from(text.matchAll(/[^ \t]+/g), (match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
  const negated = tokens[0]?.text.toLowerCase() === 'no';

  return {
    text,
    tokens,
    commandTokens: negated ? tokens.slice(1) : tokens,
    negated,
  };
};
