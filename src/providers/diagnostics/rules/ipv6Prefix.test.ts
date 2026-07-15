import { describe, expect, it } from 'vitest';
import type { LineSource } from '../../../parser/lineScanUtils';
import { parseIpv6, scanIpv6PrefixFindings } from './ipv6Prefix';

const source = (...lines: string[]): LineSource => ({
  lineCount: lines.length,
  lineAt: (index) => lines[index],
});

describe('parseIpv6', () => {
  it.each([
    '0:0:0:0:0:0:0:0',
    'FFFF:ffff:1234:0:0:0:0:1',
    '::',
    '::1',
    '2001:db8::',
    '2001:db8::1',
    '::ffff:192.0.2.255',
    '2001:db8:0:0:0:0:192.0.2.1',
  ])('accepts %s', (address) => expect(parseIpv6(address)).toBe(true));

  it.each([
    '',
    '2001:db8:0:0:0:0:0',
    '2001:db8:0:0:0:0:0:0:1',
    '2001::db8::1',
    '2001:12345::1',
    '2001:xyz::1',
    '2001:db8::1%',
    'fe80::1%eth0',
    '::ffff:192.0.2.256',
    '::ffff:192.0.2',
    '192.0.2.1',
  ])('rejects %s', (address) => expect(parseIpv6(address)).toBe(false));
});

describe('scanIpv6PrefixFindings', () => {
  it('validates complete negated standalone commands at physical offsets', () => {
    expect(
      scanIpv6PrefixFindings(source('no ipv6 address 2001:12345::1/129')),
    ).toMatchObject([
      { line: 0, start: 16, end: 29, code: 'invalid-ipv6' },
      { line: 0, code: 'invalid-prefix-length' },
    ]);
  });

  it('ignores negated deletion forms without complete operands', () => {
    expect(scanIpv6PrefixFindings(source('no ipv6 address'))).toEqual([]);
    expect(scanIpv6PrefixFindings(source('no ipv6 prefix-list PL'))).toEqual(
      [],
    );
  });

  it('keeps IPv6 ACL state across negated entries and sequence deletions', () => {
    const findings = scanIpv6PrefixFindings(
      source(
        'ipv6 access-list V6',
        ' no permit tcp host 2001:12345::1 any',
        ' no sequence 10',
        ' permit tcp host 2001:12345::2 any',
      ),
    );

    expect(findings.map(({ line, code }) => ({ line, code }))).toEqual([
      { line: 1, code: 'invalid-ipv6' },
      { line: 3, code: 'invalid-ipv6' },
    ]);
  });

  it('does not open an IPv6 ACL from a negated header', () => {
    expect(
      scanIpv6PrefixFindings(
        source(
          'no ipv6 access-list REMOVED',
          ' permit tcp host 2001:12345::1 any',
        ),
      ),
    ).toEqual([]);
  });

  it('validates address command operands and prefix boundaries with exact ranges', () => {
    const findings = scanIpv6PrefixFindings(
      source(
        ' ipv6 address 2001:db8::1/0 eui-64',
        '\tipv6 address ::/128 anycast',
        'ipv6 address 2001:12345::1/129',
        'ipv6 address 2001:db8::1/x',
      ),
    );
    expect(findings).toEqual([
      {
        line: 2,
        start: 13,
        end: 26,
        code: 'invalid-ipv6',
        message: 'Invalid IPv6 address.',
        severity: 'error',
      },
      {
        line: 2,
        start: 27,
        end: 30,
        code: 'invalid-prefix-length',
        message: 'Invalid IPv6 prefix length.',
        severity: 'warning',
      },
      {
        line: 3,
        start: 25,
        end: 26,
        code: 'invalid-prefix-length',
        message: 'Invalid IPv6 prefix length.',
        severity: 'warning',
      },
    ]);
  });

  it('validates IOS and NX-OS prefix lists and all valid modifier forms', () => {
    expect(
      scanIpv6PrefixFindings(
        source(
          'ipv6 prefix-list A permit ::/0 eq 128',
          'ipv6 prefix-list B seq 10 deny 2001:db8::/32 ge 33 le 128',
          'ipv6 prefix-list C permit 2001:db8::/64 ge 65',
          'ipv6 prefix-list D deny 2001:db8::/64 le 128',
        ),
      ),
    ).toEqual([]);
  });

  it.each([
    ['relation', 'ipv6 prefix-list P permit 2001:db8::/64 eq 64'],
    ['maximum', 'ipv6 prefix-list P permit 2001:db8::/64 ge 129'],
    ['order', 'ipv6 prefix-list P permit 2001:db8::/64 le 80 ge 70'],
    ['duplicate', 'ipv6 prefix-list P permit 2001:db8::/64 ge 70 ge 80'],
    ['mixed eq', 'ipv6 prefix-list P permit 2001:db8::/64 eq 70 le 80'],
    ['contradiction', 'ipv6 prefix-list P permit 2001:db8::/64 ge 90 le 80'],
    ['malformed', 'ipv6 prefix-list P permit 2001:db8::/64 ge x'],
    ['missing', 'ipv6 prefix-list P permit 2001:db8::/64 le'],
  ])('warns for invalid %s modifiers', (_name, line) => {
    expect(scanIpv6PrefixFindings(source(line))).toEqual([
      expect.objectContaining({
        code: 'invalid-prefix-list-modifier',
        severity: 'warning',
      }),
    ]);
  });

  it('checks decidable modifiers independently of an invalid base prefix', () => {
    expect(
      scanIpv6PrefixFindings(
        source(
          'ipv6 prefix-list P permit 2001:db8::/x ge 129 le 80',
          'ipv6 prefix-list Q permit 2001:db8::/129 eq 128',
        ),
      ).map(({ line, start, end, code }) => ({ line, start, end, code })),
    ).toEqual([
      { line: 0, start: 37, end: 38, code: 'invalid-prefix-length' },
      {
        line: 0,
        start: 42,
        end: 45,
        code: 'invalid-prefix-list-modifier',
      },
      {
        line: 0,
        start: 49,
        end: 51,
        code: 'invalid-prefix-list-modifier',
      },
      { line: 1, start: 37, end: 40, code: 'invalid-prefix-length' },
      {
        line: 1,
        start: 44,
        end: 47,
        code: 'invalid-prefix-list-modifier',
      },
    ]);
  });

  it('validates only IPv6 ACL source and destination operands', () => {
    const findings = scanIpv6PrefixFindings(
      source(
        'ipv6 access-list EDGE',
        ' 10 permit tcp 2001:12345::/64 eq 443 host 2001::xyz log',
        ' permit udp any 2001:db8::/129 range 1 2',
        ' deny icmp host ::ffff:192.0.2.256 any',
        ' remark ignored 2001:bad:::/999',
        '!',
        ' exit',
      ),
    );
    expect(
      findings.map(({ line, code, start, end }) => ({
        line,
        code,
        start,
        end,
      })),
    ).toEqual([
      { line: 1, code: 'invalid-ipv6', start: 15, end: 27 },
      { line: 1, code: 'invalid-ipv6', start: 43, end: 52 },
      { line: 2, code: 'invalid-prefix-length', start: 27, end: 30 },
      { line: 3, code: 'invalid-ipv6', start: 16, end: 34 },
    ]);
  });

  it('ends ACL state on exit or the first unrelated line and reprocesses headers', () => {
    const findings = scanIpv6PrefixFindings(
      source(
        'ipv6 access-list ONE',
        ' permit ipv6 bad:::/64 any',
        'interface Ethernet1/1',
        ' permit ipv6 bad:::/64 any',
        'ipv6 access-list TWO',
        'permit ipv6 any bad:::/64',
        'exit',
        'permit ipv6 bad:::/64 any',
        'ipv6 access-list THREE',
        ' permit ipv6 ::/0 ::/128',
      ),
    );
    expect(findings.map(({ line }) => line)).toEqual([1, 5]);
  });

  it('requires an exact ACL header and still recognizes an adjacent valid header', () => {
    const findings = scanIpv6PrefixFindings(
      source(
        'ipv6 access-list WRONG EXTRA',
        ' permit ipv6 bad:::/64 any',
        'ipv6 access-list RIGHT',
        ' permit ipv6 any bad:::/64',
      ),
    );

    expect(findings.map(({ line, code }) => ({ line, code }))).toEqual([
      { line: 3, code: 'invalid-ipv6' },
    ]);
  });

  it('ignores non-target contexts, comments, free text, IPv4 ACLs, and incomplete entries', () => {
    expect(
      scanIpv6PrefixFindings(
        source(
          '! ipv6 address bad:::/999',
          ' description ipv6 address bad:::/999',
          'set next-hop 2001:bad:::/999',
          'ip access-list extended V4',
          ' permit ipv6 bad:::/64 any',
          'ipv6 access-list V6',
          ' permit tcp bad:::/64',
          ' permit tcp object-group SRC any',
        ),
      ),
    ).toEqual([]);
  });

  it('checks cancellation at intervals and after commands and ACL members', () => {
    const lines = Array.from({ length: 258 }, () => 'ordinary');
    lines[1] = 'ipv6 address ::1/128';
    let calls = 0;
    expect(
      scanIpv6PrefixFindings(source(...lines), () => {
        calls += 1;
        return calls === 3;
      }),
    ).toEqual([]);
    expect(calls).toBe(3);

    calls = 0;
    expect(
      scanIpv6PrefixFindings(
        source('ipv6 access-list A', 'permit ipv6 bad:::/64 any'),
        () => {
          calls += 1;
          return calls === 3;
        },
      ),
    ).toEqual([]);
  });

  it('calls lineAt exactly once for every visited line', () => {
    const lines = [
      'ipv6 access-list A',
      ' permit ipv6 any ::/0',
      'exit',
      'ordinary',
    ];
    const calls = lines.map(() => 0);
    scanIpv6PrefixFindings({
      lineCount: lines.length,
      lineAt: (index) => {
        calls[index] += 1;
        return lines[index];
      },
    });
    expect(calls).toEqual([1, 1, 1, 1]);
  });
});
