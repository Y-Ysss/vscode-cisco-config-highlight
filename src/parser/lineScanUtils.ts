/** Minimal line-oriented input shared by independent streaming scanners. */
export interface LineSource {
  readonly lineCount: number;
  lineAt(index: number): string;
}

/** Returns the index of the first character after leading spaces and tabs. */
export const skipLeadingWhitespace = (line: string): number => {
  let index = 0;

  while (index < line.length) {
    const character = line[index];
    if (character !== ' ' && character !== '\t') break;
    index += 1;
  }

  return index;
};

/** Returns the first space-or-tab-delimited token, ignoring indentation. */
export const getFirstToken = (line: string): string => {
  const tokenStart = skipLeadingWhitespace(line);
  let tokenEnd = tokenStart;

  while (tokenEnd < line.length) {
    const character = line[tokenEnd];
    if (character === ' ' || character === '\t') break;
    tokenEnd += 1;
  }

  return line.slice(tokenStart, tokenEnd);
};
