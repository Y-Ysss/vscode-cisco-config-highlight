import { describe, expect, it } from 'vitest';
import type { LineSource } from '../../../parser/lineScanUtils';
import { scanNetworkObjectGroupCandidates } from './objectGroupNetwork';

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

  it('terminates on arbitrary one-token and two-token NX-OS text', () => {
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
    expect(candidates).toEqual([]);
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
