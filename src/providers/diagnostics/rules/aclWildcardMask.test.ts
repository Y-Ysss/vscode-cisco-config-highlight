import { describe, expect, it } from 'vitest';
import type { LineSource } from '../../../parser/lineScanUtils';
import {
  scanAclWildcardCandidates,
  scanAclWildcardFindings,
} from './aclWildcardMask';

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

  it.each([
    [1, 'standard'],
    [99, 'standard'],
    [100, 'extended'],
    [199, 'extended'],
    [1300, 'standard'],
    [1999, 'standard'],
    [2000, 'extended'],
    [2699, 'extended'],
  ] as const)('recognizes numbered ACL boundary %i as %s', (id, kind) => {
    const operands = kind === 'standard' ? 'permit any' : 'permit ip any any';
    const candidates = scanAclWildcardCandidates(
      source(`access-list ${id} ${operands}`),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind, action: 'permit', line: 0 });
  });

  it('ignores numbered ACL IDs outside all supported ranges', () => {
    expect(
      scanAclWildcardCandidates(
        source(
          'access-list 0 permit any',
          'access-list 200 permit ip any any',
          'access-list 1299 permit any',
          'access-list 2700 permit ip any any',
        ),
      ),
    ).toEqual([]);
  });
});

describe('scanAclWildcardFindings', () => {
  it('warns about subnet masks in wildcard positions and non-canonical pairs', () => {
    const findings = scanAclWildcardFindings(
      source(
        'access-list 10 permit 192.168.1.0 255.255.255.0',
        'access-list 10 deny 10.0.0.0 255.0.0.0',
        'access-list 10 permit 192.168.1.17 0.0.0.252',
        'ip access-list standard NAMED',
        '10 permit 198.51.100.0 255.255.255.0',
        'ip access-list extended EDGE',
        '20 permit ip 10.0.0.17 0.0.0.252 192.0.2.0 0.0.0.255',
      ),
    );

    expect(findings).toEqual([
      {
        line: 0,
        start: 34,
        end: 47,
        code: 'subnet-mask-used-as-wildcard',
        message: expect.stringContaining('0.0.0.255'),
        severity: 'warning',
      },
      {
        line: 1,
        start: 29,
        end: 38,
        code: 'subnet-mask-used-as-wildcard',
        message: expect.stringContaining('0.255.255.255'),
        severity: 'warning',
      },
      {
        line: 2,
        start: 22,
        end: 44,
        code: 'non-canonical-wildcard-address',
        message: expect.stringContaining('192.168.1.1 0.0.0.252'),
        severity: 'warning',
      },
      {
        line: 4,
        start: 23,
        end: 36,
        code: 'subnet-mask-used-as-wildcard',
        message: expect.stringContaining('0.0.0.255'),
        severity: 'warning',
      },
      {
        line: 6,
        start: 13,
        end: 32,
        code: 'non-canonical-wildcard-address',
        message: expect.stringContaining('10.0.0.1 0.0.0.252'),
        severity: 'warning',
      },
    ]);
  });

  it('does not warn for wildcard boundaries, canonical arbitrary masks, or absent pairs', () => {
    expect(
      scanAclWildcardFindings(
        source(
          'access-list 1 permit 192.0.2.1 0.0.0.0',
          'access-list 2 deny 0.0.0.0 255.255.255.255',
          'access-list 3 permit 10.0.0.0 0.255.0.255',
          'access-list 4 permit any',
          'access-list 5 permit host 192.0.2.1',
          'access-list 6 permit 192.0.2.0',
          'access-list 100 permit ip any host 192.0.2.1',
        ),
      ),
    ).toEqual([]);
  });

  it('does not add semantic warnings to lexically invalid address pairs', () => {
    const findings = scanAclWildcardFindings(
      source(
        'access-list 1 permit 999.0.0.1 255.255.255.0',
        'access-list 2 permit 192.168.1.17 255.255.255.999',
      ),
    );

    expect(findings.map(({ code }) => code)).toEqual([
      'invalid-ipv4',
      'invalid-wildcard-mask',
    ]);
  });

  it('validates standard named and numbered address/wildcard operands exactly', () => {
    const findings = scanAclWildcardFindings(
      source(
        'access-list 1 permit 999.0.0.1 0.0.0.255',
        'access-list 99 deny 10.0.0.0 0.0.0.999',
        'ip access-list standard NAMED',
        '10 permit host 192.0.2.999',
        '20 deny 198.0.100.0 0.255.0.255',
      ),
    );

    expect(findings).toEqual([
      {
        line: 0,
        start: 21,
        end: 30,
        code: 'invalid-ipv4',
        message: 'Invalid IPv4 address.',
        severity: 'error',
      },
      {
        line: 1,
        start: 29,
        end: 38,
        code: 'invalid-wildcard-mask',
        message: 'Invalid wildcard mask.',
        severity: 'error',
      },
      {
        line: 3,
        start: 15,
        end: 26,
        code: 'invalid-ipv4',
        message: 'Invalid IPv4 address.',
        severity: 'error',
      },
    ]);
  });

  it('reports lexical invalid mandatory standard operands and unambiguous wildcards', () => {
    expect(
      scanAclWildcardFindings(
        source(
          'access-list 1 permit bogus',
          'access-list 2 permit 10.0.0.0 bogus',
          'ip access-list standard NAMED',
          '10 deny malformed-address',
          '20 permit 192.0.2.0 malformed-wildcard',
        ),
      ).map(({ line, start, end, code, severity }) => ({
        line,
        start,
        end,
        code,
        severity,
      })),
    ).toEqual([
      { line: 0, start: 21, end: 26, code: 'invalid-ipv4', severity: 'error' },
      {
        line: 1,
        start: 30,
        end: 35,
        code: 'invalid-wildcard-mask',
        severity: 'error',
      },
      { line: 3, start: 8, end: 25, code: 'invalid-ipv4', severity: 'error' },
      {
        line: 4,
        start: 20,
        end: 38,
        code: 'invalid-wildcard-mask',
        severity: 'error',
      },
    ]);
  });

  it('treats ACL grammar boundaries after standard host as incomplete', () => {
    expect(
      scanAclWildcardFindings(
        source(
          'access-list 1 permit host log',
          'access-list 2 deny host eq',
          'ip access-list standard NAMED',
          '10 permit host range',
          '20 deny host bogus',
        ),
      ).map(({ line, start, end, code }) => ({ line, start, end, code })),
    ).toEqual([{ line: 4, start: 13, end: 18, code: 'invalid-ipv4' }]);
  });

  it('validates both extended address positions without treating ports/options as addresses', () => {
    const findings = scanAclWildcardFindings(
      source(
        'access-list 100 permit tcp 10.0.0.999 0.0.0.255 eq 1024 192.0.2.0 0.0.0.999 range 80 90 log',
        'ip access-list extended EDGE',
        '5 deny udp host 198.51.100.999 neq domain 203.0.113.0 0.0.0.255 eq 53',
        '10 permit tcp any 192.0.2.999 established log',
      ),
    );

    expect(
      findings.map(({ line, start, end, code }) => ({
        line,
        start,
        end,
        code,
      })),
    ).toEqual([
      { line: 0, start: 27, end: 37, code: 'invalid-ipv4' },
      { line: 0, start: 66, end: 75, code: 'invalid-wildcard-mask' },
      { line: 2, start: 16, end: 30, code: 'invalid-ipv4' },
      { line: 3, start: 18, end: 29, code: 'invalid-ipv4' },
    ]);
  });

  it('uses complete-destination backtracking for omitted wildcard ambiguity', () => {
    expect(
      scanAclWildcardFindings(
        source(
          'access-list 100 permit ip 10.0.0.0 192.0.2.999',
          'access-list 101 permit ip 10.0.0.0 0.0.0.999 192.0.2.1',
        ),
      ).map(({ line, code, start }) => ({ line, code, start })),
    ).toEqual([
      { line: 0, code: 'invalid-ipv4', start: 35 },
      { line: 1, code: 'invalid-wildcard-mask', start: 35 },
    ]);
  });

  it('reports lexical invalid mandatory extended operands in named and numbered ACLs', () => {
    expect(
      scanAclWildcardFindings(
        source(
          'access-list 100 permit ip bogus any',
          'access-list 101 deny tcp any malformed-destination',
          'ip access-list extended NAMED',
          '10 permit udp 10.0.0.0 malformed-wildcard any',
          '20 deny ip any 192.0.2.0 malformed-wildcard',
        ),
      ).map(({ line, start, end, code }) => ({ line, start, end, code })),
    ).toEqual([
      { line: 0, start: 26, end: 31, code: 'invalid-ipv4' },
      { line: 1, start: 29, end: 50, code: 'invalid-ipv4' },
      { line: 3, start: 23, end: 41, code: 'invalid-wildcard-mask' },
      { line: 4, start: 25, end: 43, code: 'invalid-wildcard-mask' },
    ]);
  });

  it('treats ACL grammar boundaries after extended host as incomplete', () => {
    expect(
      scanAclWildcardFindings(
        source(
          'access-list 100 permit ip any host range',
          'access-list 101 deny tcp host log any',
          'ip access-list extended NAMED',
          '10 permit udp any host eq',
          '20 deny ip host bogus any',
        ),
      ).map(({ line, start, end, code }) => ({ line, start, end, code })),
    ).toEqual([{ line: 4, start: 16, end: 21, code: 'invalid-ipv4' }]);
  });

  it('accepts any, valid hosts, omitted wildcards, and non-contiguous wildcards', () => {
    expect(
      scanAclWildcardFindings(
        source(
          'access-list 1 permit any',
          'access-list 2 permit host 255.255.255.255',
          'access-list 3 permit 10.0.0.0',
          'access-list 100 permit ip any host 192.0.2.1',
          'access-list 101 permit ip 10.0.0.0 192.0.2.0',
          'access-list 102 permit ip 10.0.0.0 0.255.0.255 any',
          'access-list 103 permit tcp any 192.0.2.0 ack log',
          'access-list 104 permit icmp any 192.0.2.0 echo time-range WORK',
        ),
      ),
    ).toEqual([]);
  });

  it('safely ignores unsupported, incomplete, IPv6, ASA, remarks, and free text', () => {
    expect(
      scanAclWildcardFindings(
        source(
          '! access-list 1 permit 999.0.0.1 0.0.0.999',
          'access-list 1 remark 999.0.0.1 0.0.0.999',
          'access-list OUTSIDE extended permit ip 999.0.0.1 any',
          'access-list 100 permit unsupported 999.0.0.1 any',
          'access-list 1 permit object-group NETWORKS',
          'access-list 100 permit ip object-group SOURCES any',
          'access-list 101 permit ip any interface GigabitEthernet0/0',
          'access-list 100 permit tcp any',
          'access-list 2700 permit ip 999.0.0.1 any',
          'ipv6 access-list V6',
          'permit ipv6 999.0.0.1 any',
          'description access-list 1 permit 999.0.0.1 0.0.0.999',
          'ip access-list extended BROKEN',
          'permit tcp host',
        ),
      ),
    ).toEqual([]);
  });

  it('returns no partial findings on cancellation and reads each line once', () => {
    const lines = [
      'access-list 1 permit 999.0.0.1 0.0.0.255',
      'ip access-list standard A',
      'permit 10.0.0.0 0.0.0.999',
    ];
    let cancellationCalls = 0;
    expect(
      scanAclWildcardFindings(source(...lines), () => {
        cancellationCalls += 1;
        return cancellationCalls === 3;
      }),
    ).toEqual([]);

    const lineCalls = lines.map(() => 0);
    scanAclWildcardFindings({
      lineCount: lines.length,
      lineAt: (index) => {
        lineCalls[index] += 1;
        return lines[index];
      },
    });
    expect(lineCalls).toEqual([1, 1, 1]);
  });
});
