import { describe, expect, it } from 'vitest';
import { parseDiagnosticCommand } from './diagnosticCommand';

describe('parseDiagnosticCommand', () => {
  it('keeps absolute offsets while exposing a negated command view', () => {
    const parsed = parseDiagnosticCommand(
      '\t NO\tip address 999.0.0.1 255.255.255.0',
    );

    expect(parsed.negated).toBe(true);
    expect(
      parsed.commandTokens.map(({ text, start, end }) => ({
        text,
        start,
        end,
      })),
    ).toEqual([
      { text: 'ip', start: 5, end: 7 },
      { text: 'address', start: 8, end: 15 },
      { text: '999.0.0.1', start: 16, end: 25 },
      { text: '255.255.255.0', start: 26, end: 39 },
    ]);
  });

  it('reuses the token array for an affirmative line', () => {
    const parsed = parseDiagnosticCommand(
      ' ip address 192.0.2.1 255.255.255.0',
    );

    expect(parsed.negated).toBe(false);
    expect(parsed.commandTokens).toBe(parsed.tokens);
  });

  it('does not strip no from a later position or a longer token', () => {
    expect(parseDiagnosticCommand('remark no ip address').negated).toBe(false);
    expect(parseDiagnosticCommand('notify ip address').negated).toBe(false);
  });
});
