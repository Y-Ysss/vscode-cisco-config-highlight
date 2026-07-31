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
  router_ospf: true,
  address_family: true,
  class_map: true,
  policy_map: true,
  policy_class: true,
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
    router_ospf: false,
    address_family: false,
    class_map: false,
    policy_map: false,
    policy_class: false,
    interface: false,
    sub_interface: false,
    route_map: false,
    ip_prefix_list: false,
  });

describe('extractOutlineSymbols', () => {
  it('appends one exact truncation symbol after declarations in the prefix', () => {
    const result = extractOutlineSymbols(
      source('interface Gi0/0', 'description uplink'),
      enabled(),
      () => false,
      true,
    );

    expect(result.at(-1)).toEqual({
      category: 'truncation',
      type: 'truncation',
      name: 'Truncated output (see settings for max output size)',
      detail: '',
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 18 },
      },
      selectionRange: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 18 },
      },
      children: [],
    });
    expect(result.filter(({ type }) => type === 'truncation')).toHaveLength(1);
  });

  it('returns no declaration or truncation symbol when cancelled in truncated mode', () => {
    expect(
      extractOutlineSymbols(
        source('interface Gi0/0'),
        enabled(),
        () => true,
        true,
      ),
    ).toEqual([]);
  });

  it('extracts every top-level category with irregular indentation and no separators', () => {
    const result = extractOutlineSymbols(
      source(
        'ip vrf MGMT',
        '\tip vrf forwarding MGMT',
        ' router bgp 65000',
        'router ospf 100',
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
      'router_ospf',
      'class_map',
      'policy_map',
      'route_map',
      'ip_prefix_list',
      'interface',
    ]);
    expect(result.map((symbol) => symbol.type)).toEqual(
      Array(8).fill('category'),
    );
    expect(result[0].children.map((symbol) => symbol.name)).toEqual(['MGMT']);
    expect(result[6].children[0]).toMatchObject({
      name: 'DEFAULT',
      detail: 'ip prefix-list',
      type: 'ip_prefix_list',
    });
    expect(result[6].children[0].children[0].name).toBe('permit 0.0.0.0/0');
  });

  it('groups IP prefix-list rules by list name and keeps seq in rule labels', () => {
    const result = extractOutlineSymbols(
      source(
        'ip prefix-list ALLOW-DEFAULT permit 0.0.0.0/0',
        '',
        'ip prefix-list PRIVATE-NETWORKS seq 10 permit 10.0.0.0/8 le 24',
        'ip prefix-list PRIVATE-NETWORKS seq 20 permit 172.16.0.0/12 le 24',
        'ip prefix-list PRIVATE-NETWORKS seq 30 permit 192.168.0.0/16 le 24',
      ),
      enabled(),
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ip prefix-list');
    expect(result[0].children.map(({ name }) => name)).toEqual([
      'ALLOW-DEFAULT',
      'PRIVATE-NETWORKS',
    ]);
    expect(result[0].children[0].children.map(({ name }) => name)).toEqual([
      'permit 0.0.0.0/0',
    ]);
    expect(result[0].children[1].children.map(({ name }) => name)).toEqual([
      'seq 10 permit 10.0.0.0/8 le 24',
      'seq 20 permit 172.16.0.0/12 le 24',
      'seq 30 permit 192.168.0.0/16 le 24',
    ]);
    expect(result[0].children[1].range.end).toEqual({
      line: 4,
      character: 66,
    });
  });

  it('uses disabled recognized categories as section boundaries', () => {
    const result = extractOutlineSymbols(
      source('interface Gi0/0', 'policy-map HIDDEN', 'interface Gi0/1'),
      enabled({ policy_map: false }),
    );

    expect(result).toHaveLength(2);
    expect(result[0].children.map((symbol) => symbol.name)).toEqual(['Gi0/0']);
    expect(result[1].children.map((symbol) => symbol.name)).toEqual(['Gi0/1']);
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
    ['router_ospf', ['router ospf 100']],
    ['address_family', ['router bgp 1', 'address-family ipv4']],
    ['class_map', ['class-map CLASS']],
    ['policy_map', ['policy-map POLICY']],
    ['policy_class', ['policy-map POLICY', 'class REALTIME']],
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

  it('starts a new section whenever any defined category reappears', () => {
    const result = extractOutlineSymbols(
      source(
        'interface GigabitEthernet0/0/0.10',
        'ip vrf VRFNAME',
        'interface Vlan110',
        'policy-map FIRST',
        'route-map BETWEEN permit 10',
        'policy-map SECOND',
      ),
      enabled(),
    );

    expect(result.map((symbol) => symbol.category)).toEqual([
      'interface',
      'ip_vrf',
      'interface',
      'policy_map',
      'route_map',
      'policy_map',
    ]);
    expect(result.map((symbol) => symbol.children[0].name)).toEqual([
      'GigabitEthernet0/0/0.10',
      'VRFNAME',
      'Vlan110',
      'FIRST',
      'BETWEEN permit 10',
      'SECOND',
    ]);
  });

  it('does not attach a sub-interface across another category section', () => {
    const result = extractOutlineSymbols(
      source('interface Gi0/0', 'ip vrf VRFNAME', 'interface Gi0/0.10'),
      enabled(),
    );

    expect(result.map((symbol) => symbol.category)).toEqual([
      'interface',
      'ip_vrf',
      'interface',
    ]);
    expect(result[0].children[0].children).toEqual([]);
    expect(result[2].children[0]).toMatchObject({
      name: 'Gi0/0.10',
      type: 'sub_interface',
    });
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
    expect(result[0].selectionRange.end).toEqual({
      line: 0,
      character: 16,
    });
    expect(result[0].range.end).toEqual({ line: 2, character: 9 });
  });

  it('extends leaf show ranges to the line before the next prompt and then EOF', () => {
    const result = extractOutlineSymbols(
      source(
        'Switch#show vlan',
        'VLAN Name',
        'Switch#show clock',
        '12:00:00 JST',
      ),
      enabled(),
    );

    expect(result).toHaveLength(2);
    expect(result[0].selectionRange.end).toEqual({
      line: 0,
      character: 16,
    });
    expect(result[0].range.end).toEqual({ line: 1, character: 9 });
    expect(result[1].selectionRange.end).toEqual({
      line: 2,
      character: 17,
    });
    expect(result[1].range.end).toEqual({ line: 3, character: 12 });
  });

  it.each([
    ['Router#', 'sh run'],
    ['Router#', 'sho'],
    ['Router(config)#', 'do show run'],
  ])(
    'makes %s%s an output parent when a declaration follows',
    (prompt, command) => {
      const result = extractOutlineSymbols(
        source(`${prompt}${command}`, 'interface Gi0/0'),
        enabled(),
      );

      expect(result[0].name).toBe(command);
      expect(result[0].children[0].category).toBe('interface');
      expect(result[0].children[0].children[0].name).toBe('Gi0/0');
      expect(result[0].range.end).toEqual({ line: 1, character: 15 });
    },
  );

  it('ignores configuration-mode prompt contents', () => {
    const result = extractOutlineSymbols(
      source(
        'Router#conf t',
        'Enter configuration commands, one per line.  End with CNTL/Z.',
        'Router(config)#',
        'Router(config)#',
        'Router(config)#interface GigabitEthernet0/1/0',
        'Router(config-if)# switchport mode access',
        'Router(config-if)# switchport access vlan 20',
        'Router(config-if)#',
        'Router(config-if)#interface GigabitEthernet0/1/1',
        'Router(config-if)# switchport mode access',
        'Router(config-if)# switchport access vlan 20',
        'Router(config-if)#',
      ),
      enabled(),
    );

    expect(
      result
        .filter((symbol) => symbol.category === 'command')
        .map((symbol) => symbol.name),
    ).toEqual(['conf t']);
    expect(result.some((symbol) => symbol.category === 'interface')).toBe(
      false,
    );
  });

  it('uses empty configuration prompts as boundaries without emitting commands', () => {
    const result = extractOutlineSymbols(
      source(
        'Router#shutdown',
        'interface Gi0/0',
        'Router(config)#',
        'interface Gi0/1',
      ),
      enabled(),
    );

    expect(result[0]).toMatchObject({ name: 'shutdown', children: [] });
    expect(
      result.filter((symbol) => symbol.category === 'command'),
    ).toHaveLength(1);
    expect(
      result
        .filter((symbol) => symbol.type === 'category')
        .map((symbol) => symbol.children.map((child) => child.name)),
    ).toEqual([['Gi0/0'], ['Gi0/1']]);
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

    const rootInterfaces = result.filter(
      (symbol) => symbol.type === 'category',
    );
    const command = result.find((symbol) => symbol.type === 'command');
    expect(
      rootInterfaces.map((symbol) =>
        symbol.children.map((child) => child.name),
      ),
    ).toEqual([['Gi0/0'], ['Gi0/2']]);
    expect(command?.children[0].children[0].name).toBe('Gi0/1');
    expect(rootInterfaces).not.toContain(command?.children[0]);
  });

  it('uses prompts as tree boundaries and ignores config-mode commands', () => {
    const result = extractOutlineSymbols(
      source(
        'interface Loopback0',
        ' ip vrf forwarding VRF_TEST',
        ' ip address 192.0.2.1 255.255.255.255',
        ' ',
        '!---------------------------',
        '! show run',
        '!---------------------------',
        '',
        'Router#show run',
        '!',
        'interface GigabitEthernet0/0/0',
        '',
        'interface GigabitEthernet0/0/0.10',
        '',
        'interface Vlan110',
        '',
        'Router(config)#interface GigabitEthernet0/1/0',
        'Router(config-if)# switchport mode access',
        'Router(config-if)# switchport access vlan 20',
        'Router(config-if)#',
        'Router(config-if)#interface GigabitEthernet0/1/1',
        'Router(config-if)# switchport mode access',
        'Router(config-if)# switchport access vlan 20',
        'Router(config-if)#',
        '',
        'Router#show run',
        'interface GigabitEthernet0/0/0.20',
      ),
      enabled(),
    );

    const rootInterface = result.find((symbol) => symbol.type === 'category');
    const commands = result.filter((symbol) => symbol.type === 'command');
    const firstOutputInterface = commands[0].children.find(
      (symbol) => symbol.category === 'interface',
    );
    const secondOutputInterface = commands[1].children.find(
      (symbol) => symbol.category === 'interface',
    );

    expect(rootInterface?.children.map((symbol) => symbol.name)).toEqual([
      'Loopback0',
    ]);
    expect(commands.map((symbol) => symbol.name)).toEqual([
      'show run',
      'show run',
    ]);
    expect(firstOutputInterface?.children.map((symbol) => symbol.name)).toEqual(
      ['GigabitEthernet0/0/0', 'Vlan110'],
    );
    expect(firstOutputInterface?.children[0].children[0].name).toBe(
      'GigabitEthernet0/0/0.10',
    );
    expect(
      secondOutputInterface?.children.map((symbol) => symbol.name),
    ).toEqual(['GigabitEthernet0/0/0.20']);
    expect(JSON.stringify(result)).not.toContain('GigabitEthernet0/1/0');
    expect(JSON.stringify(result)).not.toContain('GigabitEthernet0/1/1');
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

  it('nests classes under the active policy-map with exact block ranges', () => {
    const result = extractOutlineSymbols(
      source(
        'policy-map WAN-EDGE',
        ' class REALTIME',
        '  priority percent 20',
        ' class class-default',
        '  fair-queue',
        'interface Gi0/0',
      ),
      enabled(),
    );

    const policy = result[0].children[0];
    expect(policy.children.map(({ name }) => name)).toEqual([
      'REALTIME',
      'class-default',
    ]);
    expect(policy.children[0].range.end).toEqual({ line: 2, character: 21 });
    expect(policy.children[1].range.end).toEqual({ line: 4, character: 12 });
    expect(policy.range.end).toEqual({ line: 4, character: 12 });
  });

  it('ignores orphan policy classes', () => {
    expect(extractOutlineSymbols(source('class ORPHAN'), enabled())).toEqual(
      [],
    );
  });

  it('extends a policy-map range through hidden policy classes', () => {
    const result = extractOutlineSymbols(
      source('policy-map WAN', ' class HIDDEN', '  priority percent 20'),
      enabled({ policy_class: false }),
    );

    expect(result[0].children[0].children).toEqual([]);
    expect(result[0].children[0].range.end).toEqual({
      line: 2,
      character: 21,
    });
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
    expect(command.range.end).toEqual({ line: 2, character: 15 });
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
