import { describe, expect, it } from 'vitest';
import {
  type EnabledOutlineCategories,
  extractOutlineSymbols,
  type LineSource,
} from './outlineExtractor';

const source = (...lines: string[]): LineSource => ({
  lineCount: lines.length,
  lineAt: (index) => lines[index],
});

const enabled = (
  overrides: Partial<EnabledOutlineCategories> = {},
): EnabledOutlineCategories => ({
  command: true,
  ip_vrf: true,
  router_bgp: true,
  address_family: true,
  class_map: true,
  policy_map: true,
  interface: true,
  sub_interface: true,
  route_map: true,
  ip_prefix_list: true,
  ...overrides,
});

const allDisabled = (): EnabledOutlineCategories =>
  enabled({
    command: false,
    ip_vrf: false,
    router_bgp: false,
    address_family: false,
    class_map: false,
    policy_map: false,
    interface: false,
    sub_interface: false,
    route_map: false,
    ip_prefix_list: false,
  });

describe('extractOutlineSymbols', () => {
  it('extracts every top-level category with irregular indentation and no separators', () => {
    const result = extractOutlineSymbols(
      source(
        'ip vrf MGMT',
        '\tip vrf forwarding MGMT',
        ' router bgp 65000',
        '\tclass-map match-any VOICE',
        'policy-map WAN',
        '  route-map EXPORT permit 10',
        '\tip prefix-list DEFAULT permit 0.0.0.0/0',
        'interface GigabitEthernet0/0',
      ),
      enabled(),
    );

    expect(result.map((symbol) => symbol.category)).toEqual([
      'ip_vrf',
      'router_bgp',
      'class_map',
      'policy_map',
      'route_map',
      'ip_prefix_list',
      'interface',
    ]);
    expect(result.map((symbol) => symbol.type)).toEqual(
      Array(7).fill('category'),
    );
    expect(result[0].children.map((symbol) => symbol.name)).toEqual(['MGMT']);
    expect(result[5].children[0]).toMatchObject({
      name: 'DEFAULT permit 0.0.0.0/0',
      detail: 'ip prefix-list',
      type: 'ip_prefix_list',
    });
  });

  it.each(['ip vrf  forwarding MGMT', 'ip vrf\t\tforwarding MGMT'])(
    'excludes forwarding with a repeated separator: %j',
    (line) => {
      expect(extractOutlineSymbols(source(line), enabled())).toEqual([]);
    },
  );

  it('omits disabled categories without disturbing enabled declaration boundaries', () => {
    const result = extractOutlineSymbols(
      source('interface Gi0/0', 'policy-map HIDDEN', 'interface Gi0/1'),
      enabled({ policy_map: false }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].children.map((symbol) => symbol.name)).toEqual([
      'Gi0/0',
      'Gi0/1',
    ]);
    expect(result[0].children[0].range.end).toEqual({
      line: 0,
      character: 15,
    });
  });

  it('returns no symbols when every category is disabled', () => {
    expect(
      extractOutlineSymbols(
        source('Router#show run', 'interface Gi0/0'),
        allDisabled(),
      ),
    ).toEqual([]);
  });

  it.each([
    ['command', ['Router#show vlan']],
    ['ip_vrf', ['ip vrf MGMT']],
    ['router_bgp', ['router bgp 1', 'address-family ipv4']],
    ['address_family', ['router bgp 1', 'address-family ipv4']],
    ['class_map', ['class-map CLASS']],
    ['policy_map', ['policy-map POLICY']],
    ['interface', ['interface Gi0/0']],
    ['sub_interface', ['interface Gi0/0', 'interface Gi0/0.10']],
    ['route_map', ['route-map ROUTE permit 10']],
    ['ip_prefix_list', ['ip prefix-list PREFIX permit 10.0.0.0/8']],
  ] as const)('omits the %s symbol type when disabled', (category, lines) => {
    const result = extractOutlineSymbols(
      source(...lines),
      enabled({ [category]: false }),
    );
    const types = (symbols: typeof result): string[] =>
      symbols.flatMap((symbol) => [symbol.type, ...types(symbol.children)]);

    expect(types(result)).not.toContain(category);
  });

  it('groups a root category while preserving repeated declarations', () => {
    const result = extractOutlineSymbols(
      source('interface Gi0/0', 'interface Gi0/0'),
      enabled(),
    );

    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children.map((symbol) => symbol.name)).toEqual([
      'Gi0/0',
      'Gi0/0',
    ]);
  });

  it('keeps show vlan as a leaf when no declaration follows', () => {
    const result = extractOutlineSymbols(
      source('Switch#show vlan', 'VLAN Name', '1 default'),
      enabled(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'command',
      type: 'command',
      name: 'show vlan',
      children: [],
    });
    expect(result[0].range.end).toEqual({ line: 0, character: 16 });
  });

  it.each(['sh run', 'sho', 'do show run'])(
    'makes %s an output parent when a declaration follows',
    (command) => {
      const result = extractOutlineSymbols(
        source(`Router(config)#${command}`, 'interface Gi0/0'),
        enabled(),
      );

      expect(result[0].name).toBe(command);
      expect(result[0].children[0].category).toBe('interface');
      expect(result[0].children[0].children[0].name).toBe('Gi0/0');
      expect(result[0].range.end).toEqual({ line: 1, character: 15 });
    },
  );

  it('uses empty prompts as boundaries and never treats shutdown as show', () => {
    const result = extractOutlineSymbols(
      source(
        'Router#shutdown',
        'interface Gi0/0',
        'Router#',
        'interface Gi0/1',
      ),
      enabled(),
    );

    expect(result[0]).toMatchObject({ name: 'shutdown', children: [] });
    expect(
      result.filter((symbol) => symbol.category === 'command'),
    ).toHaveLength(1);
    expect(result[1].children.map((symbol) => symbol.name)).toEqual([
      'Gi0/0',
      'Gi0/1',
    ]);
  });

  it('keeps an output candidate across blank, comment, and exit lines', () => {
    const result = extractOutlineSymbols(
      source('Router#sh run', '', '!', 'exit', 'interface Gi0/0'),
      enabled(),
    );

    expect(result).toHaveLength(1);
    expect(result[0].children[0].category).toBe('interface');
  });

  it('isolates output category trees from the root category tree', () => {
    const result = extractOutlineSymbols(
      source(
        'interface Gi0/0',
        'Router#show run',
        'interface Gi0/1',
        'Router#',
        'interface Gi0/2',
      ),
      enabled(),
    );

    const rootInterface = result.find((symbol) => symbol.type === 'category');
    const command = result.find((symbol) => symbol.type === 'command');
    expect(rootInterface?.children.map((symbol) => symbol.name)).toEqual([
      'Gi0/0',
      'Gi0/2',
    ]);
    expect(command?.children[0].children[0].name).toBe('Gi0/1');
    expect(command?.children[0]).not.toBe(rootInterface);
  });

  it('places a parentless sub-interface directly under its category', () => {
    const [category] = extractOutlineSymbols(
      source('interface Gi0/0.100'),
      enabled(),
    );

    expect(category.children[0]).toMatchObject({
      name: 'Gi0/0.100',
      type: 'sub_interface',
    });
  });

  it('attaches sub-interfaces to the latest matching repeated base only', () => {
    const [category] = extractOutlineSymbols(
      source(
        'interface Gi0/0',
        'interface Gi0/0.10',
        'interface Gi0/0',
        'interface Gi0/0.20',
      ),
      enabled(),
    );

    expect(category.children).toHaveLength(2);
    expect(category.children[0].children.map((symbol) => symbol.name)).toEqual([
      'Gi0/0.10',
    ]);
    expect(category.children[1].children.map((symbol) => symbol.name)).toEqual([
      'Gi0/0.20',
    ]);
  });

  it('does not link sub-interfaces across output and root trees', () => {
    const result = extractOutlineSymbols(
      source('interface Gi0/0', 'Router#show run', 'interface Gi0/0.10'),
      enabled(),
    );
    const rootBase = result[0].children[0];
    const outputSub = result[1].children[0].children[0];

    expect(rootBase.children).toEqual([]);
    expect(outputSub.name).toBe('Gi0/0.10');
  });

  it('nests address families only under the active BGP declaration', () => {
    const result = extractOutlineSymbols(
      source(
        'address-family orphan',
        'router bgp 65000',
        'address-family ipv4',
        ' address-family vpnv4 unicast',
        'policy-map END',
        'address-family orphan-again',
      ),
      enabled(),
    );
    const bgp = result.find((symbol) => symbol.category === 'router_bgp');

    expect(bgp?.children).toHaveLength(1);
    expect(bgp?.children[0].children.map((symbol) => symbol.name)).toEqual([
      'ipv4',
      'vpnv4 unicast',
    ]);
  });

  it('does not promote a show command for an orphan address-family line', () => {
    const [command] = extractOutlineSymbols(
      source('Router#show detail', 'address-family orphan', 'ordinary output'),
      enabled(),
    );

    expect(command.children).toEqual([]);
    expect(command.range.end).toEqual({ line: 0, character: 18 });
  });

  it('computes exclusive selection and block ranges precisely', () => {
    const result = extractOutlineSymbols(
      source(
        'router bgp 1',
        ' address-family ipv4',
        '  network 10.0.0.0',
        ' address-family vpnv4',
        '  neighbor 1.1.1.1 activate',
        'interface Gi0/0',
        ' description uplink',
      ),
      enabled(),
    );
    const router = result[0].children[0];
    const [ipv4, vpnv4] = router.children;
    const iface = result[1].children[0];

    expect(router.selectionRange).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 12 },
    });
    expect(router.range.end).toEqual({ line: 4, character: 27 });
    expect(ipv4.range.end).toEqual({ line: 2, character: 18 });
    expect(vpnv4.range.end).toEqual({ line: 4, character: 27 });
    expect(iface.range.end).toEqual({ line: 6, character: 19 });
    expect(result[0].range.end).toEqual(router.range.end);
  });

  it('returns no partial result when cancelled at a 256-line checkpoint', () => {
    let checks = 0;
    const lines = Array.from({ length: 257 }, () => 'ordinary output');
    lines[0] = 'interface Gi0/0';

    expect(
      extractOutlineSymbols(source(...lines), enabled(), () => {
        checks += 1;
        return checks === 3;
      }),
    ).toEqual([]);
  });

  it('checks cancellation immediately after a successful pattern match', () => {
    let checks = 0;
    const result = extractOutlineSymbols(
      source('interface Gi0/0'),
      enabled(),
      () => {
        checks += 1;
        return checks === 2;
      },
    );

    expect(result).toEqual([]);
    expect(checks).toBe(2);
  });
});
