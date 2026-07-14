import { describe, expect, it } from 'vitest';
import { getFirstToken, skipLeadingWhitespace } from './lineScanUtils';

describe('skipLeadingWhitespace', () => {
  it('returns zero for an empty line', () => {
    expect(skipLeadingWhitespace('')).toBe(0);
  });

  it('returns the line length for a whitespace-only line', () => {
    expect(skipLeadingWhitespace(' \t  ')).toBe(4);
  });

  it('skips leading spaces and tabs', () => {
    expect(skipLeadingWhitespace(' \tinterface GigabitEthernet0/1')).toBe(2);
  });

  it('returns zero for a one-character non-whitespace line', () => {
    expect(skipLeadingWhitespace('x')).toBe(0);
  });
});

describe('getFirstToken', () => {
  it('returns an empty token for an empty line', () => {
    expect(getFirstToken('')).toBe('');
  });

  it('returns an empty token for a whitespace-only line', () => {
    expect(getFirstToken('\t  \t')).toBe('');
  });

  it('returns the first token after leading spaces and tabs', () => {
    expect(getFirstToken(' \tinterface GigabitEthernet0/1')).toBe('interface');
  });

  it('uses a tab as a token delimiter', () => {
    expect(getFirstToken('router\tbgp 65000')).toBe('router');
  });

  it('returns a one-character token from a short line', () => {
    expect(getFirstToken('x')).toBe('x');
  });
});
