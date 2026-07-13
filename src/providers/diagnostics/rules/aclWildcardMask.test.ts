import { describe, expect, it } from 'vitest';
import type { LineSource } from '../../../parser/lineScanUtils';
import { scanAclWildcardCandidates } from './aclWildcardMask';

const source = (...lines: string[]): LineSource => ({
  lineCount: lines.length,
  lineAt: (index) => lines[index],
});

describe('scanAclWildcardCandidates', () => {
  it('scans indented named standard and extended ACLs without separators', () => {
    const candidates = scanAclWildcardCandidates(
      source(
        '\tip access-list standard USERS',
        ' 10 permit 10.0.0.0 0.0.0.255',
        'remark local users',
        '20 deny any',
        ' ip access-list extended EDGE',
        '5 permit tcp host 192.0.2.1 198.51.100.0 0.0.0.255 eq 443',
      ),
    );

    expect(
      candidates.map(({ line, kind, tokens }) => ({ line, kind, tokens })),
    ).toEqual([
      {
        line: 1,
        kind: 'standard',
        tokens: [
          { text: '10', start: 1, end: 3 },
          { text: 'permit', start: 4, end: 10 },
          { text: '10.0.0.0', start: 11, end: 19 },
          { text: '0.0.0.255', start: 20, end: 29 },
        ],
      },
      {
        line: 3,
        kind: 'standard',
        tokens: [
          { text: '20', start: 0, end: 2 },
          { text: 'deny', start: 3, end: 7 },
          { text: 'any', start: 8, end: 11 },
        ],
      },
      {
        line: 5,
        kind: 'extended',
        tokens: expect.any(Array),
      },
    ]);
    expect(candidates[0].operands).toEqual(candidates[0].tokens.slice(2));
    expect(candidates[0].text).toBe(' 10 permit 10.0.0.0 0.0.0.255');
  });

  it('keeps accepted non-entry lines in state and honors exit', () => {
    const candidates = scanAclWildcardCandidates(
      source(
        'ip access-list standard ONE',
        '',
        ' ! note',
        ' remark words',
        ' permit any',
        ' exit',
        'deny 10.0.0.0 0.0.0.255',
      ),
    );
    expect(candidates.map(({ line }) => line)).toEqual([4]);
  });

  it('reprocesses a terminating line as an adjacent block header', () => {
    const candidates = scanAclWildcardCandidates(
      source(
        'ip access-list standard ONE',
        'permit any',
        'ip access-list extended TWO',
        'deny ip any any',
        'interface Ethernet1',
        'permit ip any any',
      ),
    );
    expect(candidates.map(({ line, kind }) => ({ line, kind }))).toEqual([
      { line: 1, kind: 'standard' },
      { line: 3, kind: 'extended' },
    ]);
  });

  it('skips unsupported ACL headers and incomplete or unrelated entries', () => {
    const candidates = scanAclWildcardCandidates(
      source(
        'ipv6 access-list V6',
        'permit ipv6 any any',
        'ip access-list standard INCOMPLETE',
        'permit',
        'deny any',
        'ip access-list extended ALSO-INCOMPLETE',
        'permit tcp any',
        'permit ip any any',
      ),
    );
    expect(candidates).toEqual([]);
  });

  it('checks cancellation at checkpoints and recognized pattern sites', () => {
    const lines = Array.from({ length: 258 }, () => 'unrelated');
    lines[1] = 'ip access-list standard A';
    lines[2] = 'permit any';
    let calls = 0;
    expect(
      scanAclWildcardCandidates(source(...lines), () => {
        calls += 1;
        return calls === 4;
      }),
    ).toEqual([]);
    expect(calls).toBe(4);
  });

  it.each([2, 3])(
    'returns no partial candidates when pattern-site cancellation occurs at call %i',
    (cancelAt) => {
      let calls = 0;
      const candidates = scanAclWildcardCandidates(
        source('ip access-list standard A', 'permit any'),
        () => {
          calls += 1;
          return calls === cancelAt;
        },
      );
      expect(candidates).toEqual([]);
      expect(calls).toBe(cancelAt);
    },
  );

  it('never calls lineAt more than once per visited line', () => {
    const lines = [
      'ip access-list standard A',
      'permit any',
      'ip access-list extended B',
      'permit ip any any',
    ];
    const calls = Array.from({ length: lines.length }, () => 0);
    scanAclWildcardCandidates({
      lineCount: lines.length,
      lineAt: (index) => {
        calls[index] += 1;
        return lines[index];
      },
    });
    expect(calls).toEqual([1, 1, 1, 1]);
  });
});
