import { describe, expect, it } from 'vitest';
import type { LineSource } from '../../../parser/lineScanUtils';
import {
  scanNetworkObjectGroupCandidates,
  scanNetworkObjectGroupFindings,
} from './objectGroupNetwork';

const source = (...lines: string[]): LineSource => ({
  lineCount: lines.length,
  lineAt: (index) => lines[index],
});

describe('scanNetworkObjectGroupCandidates', () => {
  it('scans IOS and both NX-OS profiles with operand ranges', () => {
    const candidates = scanNetworkObjectGroupCandidates(
      source(
        '\tobject-group network IOS-NETS',
        '  network-object 10.0.0.0 255.255.255.0',
        'object-group ip address NX4',
        ' description kept out of candidates',
        ' group-object SHARED',
        ' 10 host 192.0.2.1',
        ' 20 198.51.100.0/24',
        ' 30 203.0.113.0 0.0.0.255',
        'object-group ipv6 address NX6',
        '  host 2001:db8::1',
        '  2001:db8:1::/64',
      ),
    );

    expect(
      candidates.map(({ line, profile, memberKind, operands }) => ({
        line,
        profile,
        memberKind,
        operands,
      })),
    ).toEqual([
      {
        line: 1,
        profile: 'ios',
        memberKind: 'network-object',
        operands: [
          { text: '10.0.0.0', start: 17, end: 25 },
          { text: '255.255.255.0', start: 26, end: 39 },
        ],
      },
      {
        line: 5,
        profile: 'nxos-ipv4',
        memberKind: 'host',
        operands: [{ text: '192.0.2.1', start: 9, end: 18 }],
      },
      {
        line: 6,
        profile: 'nxos-ipv4',
        memberKind: 'prefix',
        operands: [{ text: '198.51.100.0/24', start: 4, end: 19 }],
      },
      {
        line: 7,
        profile: 'nxos-ipv4',
        memberKind: 'address-wildcard',
        operands: [
          { text: '203.0.113.0', start: 4, end: 15 },
          { text: '0.0.0.255', start: 16, end: 25 },
        ],
      },
      {
        line: 9,
        profile: 'nxos-ipv6',
        memberKind: 'host',
        operands: [{ text: '2001:db8::1', start: 7, end: 18 }],
      },
      {
        line: 10,
        profile: 'nxos-ipv6',
        memberKind: 'prefix',
        operands: [{ text: '2001:db8:1::/64', start: 2, end: 17 }],
      },
    ]);
    expect(candidates[0].text).toBe('  network-object 10.0.0.0 255.255.255.0');
  });

  it('accepts metadata and comments but exit ends the block', () => {
    const candidates = scanNetworkObjectGroupCandidates(
      source(
        'object-group network A',
        '',
        ' ! comment',
        ' description ignored',
        ' group-object SHARED',
        ' network-object host 10.0.0.1',
        ' exit',
        ' network-object 10.0.1.0 255.255.255.0',
      ),
    );
    expect(candidates.map(({ line }) => line)).toEqual([5]);
  });

  it('reprocesses adjacent headers when exit is missing', () => {
    const candidates = scanNetworkObjectGroupCandidates(
      source(
        'object-group network IOS',
        'network-object 10.0.0.0 255.255.255.0',
        'object-group ip address NX',
        '5 host 192.0.2.5',
      ),
    );
    expect(candidates.map(({ line, profile }) => ({ line, profile }))).toEqual([
      { line: 1, profile: 'ios' },
      { line: 3, profile: 'nxos-ipv4' },
    ]);
  });

  it('terminates on unsupported members and skips unrelated group forms', () => {
    const candidates = scanNetworkObjectGroupCandidates(
      source(
        'object-group service WEB tcp',
        'host 192.0.2.1',
        'object network ASA',
        'subnet 10.0.0.0 255.255.255.0',
        'object-group ipv6 address V6',
        '2001:db8:: 0:0:0:0:ffff:ffff:ffff:ffff',
        'host 2001:db8::1',
        'object-group ip address NX',
        'range 192.0.2.1 192.0.2.5',
        'host 192.0.2.10',
      ),
    );
    expect(candidates).toEqual([]);
  });

  it('retains explicit malformed hosts and attempted CIDR but terminates on free text', () => {
    const candidates = scanNetworkObjectGroupCandidates(
      source(
        'object-group ip address BAD-PREFIX',
        'foo/bar',
        'host 192.0.2.1',
        'object-group ip address FREE-TEXT',
        'free text',
        'host 192.0.2.2',
        'object-group ip address BAD-HOST',
        'host not-an-ip',
        'host 192.0.2.3',
        'object-group ipv6 address BAD-V6',
        'abcd/64',
        'host 2001:db8::1',
        'object-group ipv6 address BAD-V6-HOST',
        'host definitely-not-ip',
        'host 2001:db8::2',
      ),
    );
    expect(
      candidates.map(({ line, memberKind }) => ({ line, memberKind })),
    ).toEqual([
      { line: 1, memberKind: 'prefix' },
      { line: 2, memberKind: 'host' },
      { line: 7, memberKind: 'host' },
      { line: 8, memberKind: 'host' },
      { line: 10, memberKind: 'prefix' },
      { line: 11, memberKind: 'host' },
      { line: 13, memberKind: 'host' },
      { line: 14, memberKind: 'host' },
    ]);
  });

  it('retains IP-shaped values with invalid ranges for Task 10', () => {
    const candidates = scanNetworkObjectGroupCandidates(
      source(
        'object-group ip address INVALID-V4',
        'host 999.2.3.4',
        '300.1.1.0/99',
        '999.1.1.0 0.0.0.999',
        'object-group ipv6 address INVALID-V6',
        'host 12345::1',
        '2001:db8::/999',
      ),
    );
    expect(
      candidates.map(({ line, memberKind }) => ({ line, memberKind })),
    ).toEqual([
      { line: 1, memberKind: 'host' },
      { line: 2, memberKind: 'prefix' },
      { line: 3, memberKind: 'address-wildcard' },
      { line: 5, memberKind: 'host' },
      { line: 6, memberKind: 'prefix' },
    ]);
  });

  it('checks cancellation at checkpoints and recognized pattern sites', () => {
    const lines = Array.from({ length: 258 }, () => 'unrelated');
    lines[1] = 'object-group ip address A';
    lines[2] = '10 host 192.0.2.1';
    let calls = 0;
    expect(
      scanNetworkObjectGroupCandidates(source(...lines), () => {
        calls += 1;
        return calls === 4;
      }),
    ).toEqual([]);
    expect(calls).toBe(4);
  });

  it.each([2, 3])(
    'returns no partial members when pattern-site cancellation occurs at call %i',
    (cancelAt) => {
      let calls = 0;
      const candidates = scanNetworkObjectGroupCandidates(
        source('object-group ip address A', 'host 192.0.2.1'),
        () => {
          calls += 1;
          return calls === cancelAt;
        },
      );
      expect(candidates).toEqual([]);
      expect(calls).toBe(cancelAt);
    },
  );

  it('reads each visited line once', () => {
    const lines = [
      'object-group network A',
      'network-object host 10.0.0.1',
      'object-group ip address B',
      'host 192.0.2.1',
    ];
    const calls = Array.from({ length: lines.length }, () => 0);
    scanNetworkObjectGroupCandidates({
      lineCount: lines.length,
      lineAt: (index) => {
        calls[index] += 1;
        return lines[index];
      },
    });
    expect(calls).toEqual([1, 1, 1, 1]);
  });
});

describe('scanNetworkObjectGroupFindings', () => {
  it('accepts all supported IOS and NX-OS member forms and boundaries', () => {
    expect(
      scanNetworkObjectGroupFindings(
        source(
          'object-group network IOS',
          ' network-object host 0.0.0.0',
          ' network-object 255.255.255.255 255.255.255.255',
          'object-group ip address NX4',
          ' 10 host 192.0.2.1',
          ' 20 0.0.0.0/0',
          ' 30 255.255.255.255/32',
          ' 40 198.51.100.0 0.255.0.255',
          'object-group ipv6 address NX6',
          ' 10 host ::',
          ' 20 host ::ffff:192.0.2.255',
          ' 30 ::/0',
          ' 40 2001:DB8::/128',
        ),
      ),
    ).toEqual([]);
  });

  it('reports IOS address, subnet-mask, and continuity findings exactly', () => {
    expect(
      scanNetworkObjectGroupFindings(
        source(
          'object-group network IOS',
          ' network-object host bogus',
          ' network-object 999.0.0.1 255.255.255.0',
          ' network-object 10.0.0.0 bad-mask',
          ' network-object 10.0.0.0 255.0.255.0',
        ),
      ),
    ).toEqual([
      {
        line: 1,
        start: 21,
        end: 26,
        code: 'invalid-ipv4',
        message: 'Invalid IPv4 address.',
        severity: 'error',
      },
      {
        line: 2,
        start: 16,
        end: 25,
        code: 'invalid-ipv4',
        message: 'Invalid IPv4 address.',
        severity: 'error',
      },
      {
        line: 3,
        start: 25,
        end: 33,
        code: 'invalid-subnet-mask',
        message: 'Invalid subnet mask.',
        severity: 'error',
      },
      {
        line: 4,
        start: 25,
        end: 36,
        code: 'non-contiguous-subnet-mask',
        message: 'Subnet mask is not contiguous.',
        severity: 'warning',
      },
    ]);
  });

  it('allows non-contiguous IOS masks only through the option', () => {
    expect(
      scanNetworkObjectGroupFindings(
        source(
          'object-group network IOS',
          'network-object 10.0.0.0 255.0.255.0',
        ),
        { allowNonContiguousMask: true },
      ),
    ).toEqual([]);
  });

  it('validates NX-OS IPv4 host, CIDR components, and wildcard independently', () => {
    expect(
      scanNetworkObjectGroupFindings(
        source(
          'object-group ip address NX4',
          ' 10 host malformed',
          ' 20 999.0.0.1/33',
          ' 30 foo/bar',
          ' 40 10.0.0.0 malformed-wildcard',
          ' 50 malformed-address 0.0.0.999',
          ' 60 10.0.0.0 0.255.0.255',
        ),
      ).map(({ line, start, end, code, severity }) => ({
        line,
        start,
        end,
        code,
        severity,
      })),
    ).toEqual([
      { line: 1, start: 9, end: 18, code: 'invalid-ipv4', severity: 'error' },
      { line: 2, start: 4, end: 13, code: 'invalid-ipv4', severity: 'error' },
      {
        line: 2,
        start: 14,
        end: 16,
        code: 'invalid-prefix-length',
        severity: 'warning',
      },
      { line: 3, start: 4, end: 7, code: 'invalid-ipv4', severity: 'error' },
      {
        line: 3,
        start: 8,
        end: 11,
        code: 'invalid-prefix-length',
        severity: 'warning',
      },
      {
        line: 4,
        start: 13,
        end: 31,
        code: 'invalid-wildcard-mask',
        severity: 'error',
      },
      { line: 5, start: 4, end: 21, code: 'invalid-ipv4', severity: 'error' },
      {
        line: 5,
        start: 22,
        end: 31,
        code: 'invalid-wildcard-mask',
        severity: 'error',
      },
    ]);
  });

  it('validates NX-OS IPv6 hosts, embedded IPv4, and CIDR components', () => {
    expect(
      scanNetworkObjectGroupFindings(
        source(
          'object-group ipv6 address NX6',
          ' host 12345::1',
          ' 10 host ::ffff:192.0.2.256',
          ' 20 2001:db8::/129',
          ' 30 bad:::/prefix',
        ),
      ).map(({ line, start, end, code, severity }) => ({
        line,
        start,
        end,
        code,
        severity,
      })),
    ).toEqual([
      { line: 1, start: 6, end: 14, code: 'invalid-ipv6', severity: 'error' },
      { line: 2, start: 9, end: 27, code: 'invalid-ipv6', severity: 'error' },
      {
        line: 3,
        start: 15,
        end: 18,
        code: 'invalid-prefix-length',
        severity: 'warning',
      },
      { line: 4, start: 4, end: 10, code: 'invalid-ipv6', severity: 'error' },
      {
        line: 4,
        start: 11,
        end: 17,
        code: 'invalid-prefix-length',
        severity: 'warning',
      },
    ]);
  });

  it('retains a malformed IPv4-like operand in an unambiguous two-value slot', () => {
    expect(
      scanNetworkObjectGroupFindings(
        source('object-group ip address NX4', ' 10 1.2.3 malformed-mask'),
      ).map(({ start, end, code }) => ({ start, end, code })),
    ).toEqual([
      { start: 4, end: 9, code: 'invalid-ipv4' },
      { start: 10, end: 24, code: 'invalid-wildcard-mask' },
    ]);
  });

  it('treats known grammar words as incomplete and ordinary free text as termination', () => {
    expect(
      scanNetworkObjectGroupFindings(
        source(
          'object-group ip address INCOMPLETE',
          'host description',
          'object-group ip address FREE',
          'ordinary free-text',
          'host malformed',
          'object-group network IOS',
          'network-object host exit',
          'network-object host malformed-after-termination',
        ),
      ),
    ).toEqual([]);
  });

  it('ignores metadata, unsupported blocks, and ASA syntax', () => {
    expect(
      scanNetworkObjectGroupFindings(
        source(
          'object-group service WEB tcp',
          'host bad',
          'object network ASA',
          'host bad',
          'object-group ip address NX',
          'description host bad',
          'group-object BAD',
          '! host bad',
          'exit',
          'host bad',
        ),
      ),
    ).toEqual([]);
  });

  it('returns no partial findings on cancellation and reads each line once', () => {
    const lines = [
      'object-group ip address NX',
      'host malformed',
      '2001:db8::/999',
    ];
    let cancellationCalls = 0;
    expect(
      scanNetworkObjectGroupFindings(source(...lines), {}, () => {
        cancellationCalls += 1;
        return cancellationCalls === 3;
      }),
    ).toEqual([]);

    const calls = lines.map(() => 0);
    scanNetworkObjectGroupFindings({
      lineCount: lines.length,
      lineAt: (index) => {
        calls[index] += 1;
        return lines[index];
      },
    });
    expect(calls).toEqual([1, 1, 1]);
  });

  it('discards findings when cancellation arrives after candidate collection', () => {
    let calls = 0;
    expect(
      scanNetworkObjectGroupFindings(
        source('object-group ip address NX', 'host malformed'),
        {},
        () => {
          calls += 1;
          return calls === 4;
        },
      ),
    ).toEqual([]);
    expect(calls).toBe(4);
  });
});
