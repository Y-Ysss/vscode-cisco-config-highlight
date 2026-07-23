import { describe, expect, it } from 'vitest';
import type { LineSource } from '../../../parser/lineScanUtils';
import {
  isContiguousSubnetMask,
  parseIpv4,
  scanIpPrefixFindings,
} from './ipPrefix';

const source = (...lines: string[]): LineSource => ({
  lineCount: lines.length,
  lineAt: (index) => lines[index],
});

describe('IPv4 primitives', () => {
  it('accepts boundary octets and rejects malformed or out-of-range input', () => {
    expect(parseIpv4('0.255.1.254')).toEqual([0, 255, 1, 254]);
    expect(parseIpv4('1.2.3')).toBeUndefined();
    expect(parseIpv4('1.2.3.4.5')).toBeUndefined();
    expect(parseIpv4('1..3.4')).toBeUndefined();
    expect(parseIpv4('1.2.3.x')).toBeUndefined();
    expect(parseIpv4('1.2.3.256')).toBeUndefined();
  });

  it('recognizes contiguous masks including both boundaries', () => {
    expect(isContiguousSubnetMask([0, 0, 0, 0])).toBe(true);
    expect(isContiguousSubnetMask([255, 255, 255, 255])).toBe(true);
    expect(isContiguousSubnetMask([255, 255, 254, 0])).toBe(true);
    expect(isContiguousSubnetMask([255, 0, 255, 0])).toBe(false);
  });
});

describe('scanIpPrefixFindings', () => {
  it('validates complete negated commands at physical line offsets', () => {
    const negated = '  no ip address 999.0.0.1 255.255.255.0';

    expect(scanIpPrefixFindings(source(negated))).toMatchObject([
      { line: 0, start: 16, end: 25, code: 'invalid-ipv4' },
    ]);
    expect(
      scanIpPrefixFindings(
        source('no ip route 10.0.0.17 255.255.255.0 Null0'),
      ).map(({ code }) => code),
    ).toContain('host-bits-set');
  });

  it('ignores negated deletion forms without complete operands', () => {
    for (const line of [
      'no ip address',
      'no ip prefix-list PL',
      'no ip prefix-list PL seq 10',
      'no network 10.0.0.0',
    ]) {
      expect(scanIpPrefixFindings(source(line))).toEqual([]);
    }
  });

  it.each([
    'ip route static inter-vrf',
    'ip route static adjust-time 60',
    'ip route static aadjust-time 60',
    'no ip route static inter-vrf',
  ])('ignores static-route control commands: %s', (line) => {
    expect(scanIpPrefixFindings(source(line))).toEqual([]);
  });

  it.each([
    [
      'ip route 2.0.0.0 0.0.0.0 192.168.1.1',
      '2.0.0.0 0.0.0.0',
      "Not aligned. Use '0.0.0.0 0.0.0.0' or '2.0.0.0 254.0.0.0' (or more specific).",
    ],
    [
      'ip route 10.210.10.0 255.255.0.0 1.1.1.1',
      '10.210.10.0 255.255.0.0',
      "Not aligned. Use '10.210.0.0 255.255.0.0' or '10.210.10.0 255.255.254.0' (or more specific).",
    ],
    [
      'ip route 255.0.0.10 255.255.255.0',
      '255.0.0.10 255.255.255.0',
      "Not aligned. Use '255.0.0.0 255.255.255.0' or '255.0.0.10 255.255.255.254' (or more specific).",
    ],
    [
      'network 10.0.0.17 mask 255.255.255.248',
      '10.0.0.17 mask 255.255.255.248',
      "Not aligned. Use '10.0.0.16 mask 255.255.255.248' or '10.0.0.17 mask 255.255.255.255'.",
    ],
    [
      'network 10.210.10.0 mask 255.255.0.0',
      '10.210.10.0 mask 255.255.0.0',
      "Not aligned. Use '10.210.0.0 mask 255.255.0.0' or '10.210.10.0 mask 255.255.254.0' (or more specific).",
    ],
    [
      'ip prefix-list PL permit 10.210.10.0/16',
      '10.210.10.0/16',
      "Not aligned to /16. Use '10.210.0.0/16' or '10.210.10.0/23+'.",
    ],
    [
      'ip prefix-list ZERO permit 2.0.0.0/0',
      '2.0.0.0/0',
      "Not aligned to /0. Use '0.0.0.0/0' or '2.0.0.0/7+'.",
    ],
  ])(
    'warns when a network operand has host bits: %s',
    (line, rangeText, message) => {
      expect(scanIpPrefixFindings(source(line))).toEqual([
        {
          line: 0,
          start: line.indexOf(rangeText),
          end: line.indexOf(rangeText) + rangeText.length,
          code: 'host-bits-set',
          message,
          severity: 'warning',
        },
      ]);
    },
  );

  it.each([
    'ip address 10.0.0.1 255.255.255.0',
    'ip route 999.0.0.1 255.255.255.0 Null0',
    'ip route 10.0.0.17 255.0.255.0 Null0',
    'network 10.0.0.17 mask 255.0.255.0',
    'ip prefix-list BAD permit 10.0.0.17/33',
    'ip prefix-list TEXT permit 10.0.0.17/x',
  ])('does not perform boundary validation for: %s', (line) => {
    expect(
      scanIpPrefixFindings(source(line)).some(
        ({ code }) => code === 'host-bits-set',
      ),
    ).toBe(false);
  });

  it('does not treat allowing a non-contiguous mask as boundary-validatable', () => {
    expect(
      scanIpPrefixFindings(source('ip route 10.0.0.17 255.0.255.0 Null0'), {
        allowNonContiguousMask: true,
      }),
    ).toEqual([]);
  });

  it('validates target address and subnet-mask operands with exact ranges', () => {
    const findings = scanIpPrefixFindings(
      source(
        ' ip route 999.2.3.4 255.0.255.0 Null0',
        '\tip address 10.0.0.1 255.255.255.0',
        ' network 10.2.3  mask 255.255.255.999 route-map X',
      ),
    );

    expect(findings).toEqual([
      {
        line: 0,
        start: 10,
        end: 19,
        code: 'invalid-ipv4',
        message: 'Invalid IPv4 address.',
        severity: 'error',
      },
      {
        line: 0,
        start: 20,
        end: 31,
        code: 'non-contiguous-subnet-mask',
        message: 'Subnet mask is not contiguous.',
        severity: 'warning',
      },
      {
        line: 2,
        start: 9,
        end: 15,
        code: 'invalid-ipv4',
        message: 'Invalid IPv4 address.',
        severity: 'error',
      },
      {
        line: 2,
        start: 22,
        end: 37,
        code: 'invalid-subnet-mask',
        message: 'Invalid subnet mask.',
        severity: 'error',
      },
    ]);
  });

  it('allows non-contiguous subnet masks only when requested', () => {
    const input = source('ip address 10.0.0.1 255.0.255.0');
    expect(scanIpPrefixFindings(input)).toHaveLength(1);
    expect(
      scanIpPrefixFindings(input, { allowNonContiguousMask: true }),
    ).toEqual([]);
  });

  it('validates prefix-list address and prefix components at 0 and 32', () => {
    const findings = scanIpPrefixFindings(
      source(
        'ip prefix-list ZERO permit 0.0.0.0/0',
        'ip prefix-list HOST seq 10 deny 255.255.255.255/32',
        'ip prefix-list BAD permit 300.1.1.0/33',
        'ip prefix-list TEXT deny 10.0.0.0/x',
        'ip prefix-list SHAPE permit 10.0.0/24',
        'ip prefix-list SLASH permit 10.0.0.0/24/25',
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
      { line: 2, start: 26, end: 35, code: 'invalid-ipv4' },
      { line: 2, start: 36, end: 38, code: 'invalid-prefix-length' },
      { line: 3, start: 34, end: 35, code: 'invalid-prefix-length' },
      { line: 4, start: 28, end: 34, code: 'invalid-ipv4' },
      { line: 5, start: 37, end: 42, code: 'invalid-prefix-length' },
    ]);
    expect(
      findings.every(
        (finding) =>
          finding.severity !== 'error' || finding.code === 'invalid-ipv4',
      ),
    ).toBe(true);
  });

  it.each([
    ['eq', 'ip prefix-list P permit 10.0.0.0/8 eq 9'],
    ['ge/le', 'ip prefix-list P permit 10.0.0.0/8 ge 9 le 32'],
    ['le', 'ip prefix-list P permit 10.0.0.0/8 le 32'],
    ['ge', 'ip prefix-list P permit 10.0.0.0/8 ge 9'],
  ])('accepts the valid %s modifier relation', (_name, line) => {
    expect(scanIpPrefixFindings(source(line))).toEqual([]);
  });

  it.each([
    ['eq not above prefix', 'ip prefix-list P permit 10.0.0.0/8 eq 8'],
    ['eq above 32', 'ip prefix-list P permit 10.0.0.0/8 eq 33'],
    ['ge not above prefix', 'ip prefix-list P permit 10.0.0.0/8 ge 8'],
    ['le not above prefix', 'ip prefix-list P permit 10.0.0.0/8 le 8'],
    ['ge above le', 'ip prefix-list P permit 10.0.0.0/8 ge 24 le 16'],
    ['duplicate', 'ip prefix-list P permit 10.0.0.0/8 ge 9 ge 10'],
    ['unknown order', 'ip prefix-list P permit 10.0.0.0/8 le 24 ge 9'],
    ['mixed eq', 'ip prefix-list P permit 10.0.0.0/8 eq 16 le 24'],
    ['malformed', 'ip prefix-list P permit 10.0.0.0/8 ge x'],
    ['missing', 'ip prefix-list P permit 10.0.0.0/8 le'],
    ['unknown', 'ip prefix-list P permit 10.0.0.0/8 foo 9'],
  ])('warns for %s modifier syntax or relation', (_name, line) => {
    const findings = scanIpPrefixFindings(source(line));
    expect(findings.length).toBeGreaterThan(0);
    expect(
      findings.every(
        ({ code, severity }) =>
          code === 'invalid-prefix-list-modifier' && severity === 'warning',
      ),
    ).toBe(true);
  });

  it('checks the modifier maximum even when the base prefix is invalid', () => {
    expect(
      scanIpPrefixFindings(
        source('ip prefix-list P permit 10.0.0.0/33 eq 99'),
      ).map(({ code }) => code),
    ).toEqual(['invalid-prefix-length', 'invalid-prefix-list-modifier']);
  });

  it('checks a modifier against a numeric out-of-range base prefix', () => {
    const findings = scanIpPrefixFindings(
      source('ip prefix-list P permit 10.0.0.0/33 eq 32'),
    );
    expect(findings).toHaveLength(2);
    expect(findings[1]).toMatchObject({
      line: 0,
      start: 39,
      end: 41,
      code: 'invalid-prefix-list-modifier',
      severity: 'warning',
    });
  });

  it('checks ge/le ordering independently of a malformed base prefix', () => {
    const findings = scanIpPrefixFindings(
      source('ip prefix-list P permit 10.0.0.0/x ge 24 le 16'),
    );
    expect(findings).toHaveLength(2);
    expect(findings[1]).toMatchObject({
      line: 0,
      start: 44,
      end: 46,
      code: 'invalid-prefix-list-modifier',
      severity: 'warning',
    });
  });

  it('checks ge/le ordering independently of the modifier maximum', () => {
    const findings = scanIpPrefixFindings(
      source('ip prefix-list P permit 10.0.0.0/x ge 99 le 16'),
    );
    expect(findings.slice(1)).toMatchObject([
      {
        start: 38,
        end: 40,
        code: 'invalid-prefix-list-modifier',
        severity: 'warning',
      },
      {
        start: 44,
        end: 46,
        code: 'invalid-prefix-list-modifier',
        severity: 'warning',
      },
    ]);
  });

  it('validates NX route-match mask shape but never its continuity', () => {
    const findings = scanIpPrefixFindings(
      source(
        'ip prefix-list MATCH permit 10.0.0.0/8 mask 255.0.255.0',
        'ip prefix-list BAD permit 10.0.0.0/8 mask 255.0.999.0',
        'ip prefix-list MISSING permit 10.0.0.0/8 mask',
        'ip prefix-list EXTRA permit 10.0.0.0/8 mask 255.0.0.0 tail',
        'ip prefix-list MIX permit 10.0.0.0/8 ge 9 mask 255.0.0.0',
        'ip prefix-list BOTH permit 10.0.0.0/8 mask 255.999.0.0 tail',
      ),
    );

    expect(findings.map(({ line, code }) => ({ line, code }))).toEqual([
      { line: 1, code: 'invalid-route-match-mask' },
      { line: 2, code: 'invalid-prefix-list-modifier' },
      { line: 3, code: 'invalid-prefix-list-modifier' },
      { line: 4, code: 'invalid-prefix-list-modifier' },
      { line: 5, code: 'invalid-route-match-mask' },
      { line: 5, code: 'invalid-prefix-list-modifier' },
    ]);
  });

  it('ignores comments, descriptions, unsupported commands, and wrong positions', () => {
    expect(
      scanIpPrefixFindings(
        source(
          '! ip route 999.1.1.1 255.0.255.0',
          ' description ip address 999.1.1.1 255.0.255.0',
          'set ip next-hop 999.1.1.1/99',
          'route 999.1.1.1 255.0.255.0',
          'ip route vrf BLUE 999.1.1.1 255.0.255.0',
          'network mask 255.0.255.0 999.1.1.1',
          'ipv6 prefix-list V6 permit 2001:db8::/129',
        ),
      ),
    ).toEqual([]);
  });

  it('checks cancellation at checkpoints and after recognized candidates', () => {
    const lines = Array.from({ length: 258 }, () => 'unrelated');
    lines[1] = 'ip address 10.0.0.1 255.255.255.0';
    let calls = 0;
    expect(
      scanIpPrefixFindings(source(...lines), {}, () => {
        calls += 1;
        return calls === 3;
      }),
    ).toEqual([]);
    expect(calls).toBe(3);
  });

  it('returns no partial findings after pattern-site cancellation', () => {
    let calls = 0;
    expect(
      scanIpPrefixFindings(
        source('ip route 999.1.1.1 255.255.255.0'),
        {},
        () => {
          calls += 1;
          return calls === 2;
        },
      ),
    ).toEqual([]);
  });

  it('calls lineAt once per visited line', () => {
    const lines = [
      'ordinary',
      'ip address 10.0.0.1 255.255.255.0',
      'network 10.0.0.0 mask 255.255.255.0',
    ];
    const calls = lines.map(() => 0);
    scanIpPrefixFindings({
      lineCount: lines.length,
      lineAt: (index) => {
        calls[index] += 1;
        return lines[index];
      },
    });
    expect(calls).toEqual([1, 1, 1]);
  });
});
