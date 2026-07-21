import { describe, expect, it } from 'vitest';
import {
  isConfigurationShowCommand,
  isShowCommand,
  matchDeclaration,
  PROMPT_PATTERN,
} from './declarationMatcher';

describe('matchDeclaration', () => {
  it.each([
    ['ip vrf MGMT', 'ip_vrf', 'MGMT', 'ip vrf'],
    ['router bgp 65000', 'router_bgp', '65000', 'router bgp'],
    [
      'address-family ipv4 unicast',
      'address_family',
      'ipv4 unicast',
      'address-family',
    ],
    ['class-map match-any VOICE', 'class_map', 'match-any VOICE', 'class-map'],
    ['policy-map WAN', 'policy_map', 'WAN', 'policy-map'],
    [
      'interface GigabitEthernet0/0',
      'interface',
      'GigabitEthernet0/0',
      'interface',
    ],
    [
      'interface GigabitEthernet0/0.10',
      'sub_interface',
      'GigabitEthernet0/0.10',
      'sub-interface',
    ],
    [
      'route-map EXPORT permit 10',
      'route_map',
      'EXPORT permit 10',
      'route-map',
    ],
    [
      'ip prefix-list DEFAULT permit 0.0.0.0/0',
      'ip_prefix_list',
      'DEFAULT permit 0.0.0.0/0',
      'ip prefix-list',
    ],
  ] as const)('recognizes %s', (line, category, name, detail) => {
    expect(matchDeclaration(line, 0)).toMatchObject({
      category,
      name,
      detail,
      startCharacter: 0,
      endCharacter: line.length,
    });
  });

  it.each([
    'ip vrf forwarding MGMT',
    'ip vrf  forwarding MGMT',
    'ip vrf\t\tforwarding MGMT',
  ])('excludes forwarding commands: %s', (line) => {
    expect(matchDeclaration(line, 0)).toBeUndefined();
  });
});

describe('prompt command helpers', () => {
  it('recognizes prompts and show-command variants', () => {
    expect('Router(config)#do show run'.match(PROMPT_PATTERN)?.groups).toEqual({
      mode: 'config',
      command: 'do show run',
    });
    expect(isShowCommand('sho version')).toBe(true);
    expect(isConfigurationShowCommand('do show run')).toBe(true);
    expect(isConfigurationShowCommand('show run')).toBe(false);
  });
});
