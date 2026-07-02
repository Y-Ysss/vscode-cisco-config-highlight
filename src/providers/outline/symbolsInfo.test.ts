import { describe, expect, it } from 'vitest';
// vscode is mocked via alias in vitest.config.ts; no vi.mock needed
import { symbolsInfo } from './symbolsInfo';

// Helper: returns true if the combined pattern matches the given line
const matches = (name: keyof typeof symbolsInfo, line: string): boolean => {
  const { pattern, item_pattern } = symbolsInfo[name];
  const combined = new RegExp(
    `(?<index_${name}>${pattern.source})(?<submatch_${name}>${item_pattern.source})`,
  );
  const m = line.match(combined);
  if (!m?.groups) return false;
  return m.groups[`submatch_${name}`] !== undefined;
};

// ----- command -----
describe('symbolsInfo.command', () => {
  it('matches a prompt line with # and a command', () => {
    expect(matches('command', 'Router#show running-config')).toBe(true);
  });

  it('matches a prompt line with > and a command', () => {
    expect(matches('command', 'Switch>show ip interface brief')).toBe(true);
  });

  it('matches a bare prompt (no command) — submatch is empty string, skipped by provideDocumentSymbols', () => {
    // Pattern matches but submatch is '' → skipped in provideDocumentSymbols
    expect(matches('command', 'Router#')).toBe(true);
  });

  it('does not match when # appears at end of line (output line)', () => {
    expect(matches('command', 'Router#show running-config #')).toBe(false);
  });

  it('does not match lines starting with a space', () => {
    expect(matches('command', ' Router#show version')).toBe(false);
  });

  it('does not match lines starting with a tab', () => {
    expect(matches('command', '\tRouter#show version')).toBe(false);
  });
});

// ----- ip_vrf -----
describe('symbolsInfo.ip_vrf', () => {
  it('matches "ip vrf NAME"', () => {
    expect(matches('ip_vrf', 'ip vrf MGMT')).toBe(true);
  });

  it('does not match "ip vrf forwarding" (negative lookahead)', () => {
    expect(matches('ip_vrf', 'ip vrf forwarding MGMT')).toBe(false);
  });

  it('matches an indented line', () => {
    expect(matches('ip_vrf', ' ip vrf MGMT')).toBe(true);
  });
});

// ----- router_bgp -----
describe('symbolsInfo.router_bgp', () => {
  it('matches "router bgp 65000"', () => {
    expect(matches('router_bgp', 'router bgp 65000')).toBe(true);
  });

  it('matches an indented line', () => {
    expect(matches('router_bgp', ' router bgp 100')).toBe(true);
  });
});

// ----- address_family -----
describe('symbolsInfo.address_family', () => {
  it('matches "address-family ipv4"', () => {
    expect(matches('address_family', ' address-family ipv4')).toBe(true);
  });

  it('matches "address-family vpnv4 unicast"', () => {
    expect(matches('address_family', '  address-family vpnv4 unicast')).toBe(
      true,
    );
  });
});

// ----- class_map -----
describe('symbolsInfo.class_map', () => {
  it('matches "class-map NAME"', () => {
    expect(matches('class_map', 'class-map VOICE')).toBe(true);
  });

  it('matches "class-map match-any NAME"', () => {
    expect(matches('class_map', 'class-map match-any DATA')).toBe(true);
  });
});

// ----- policy_map -----
describe('symbolsInfo.policy_map', () => {
  it('matches "policy-map NAME"', () => {
    expect(matches('policy_map', 'policy-map QOS')).toBe(true);
  });
});

// ----- interface -----
describe('symbolsInfo.interface', () => {
  it('matches "interface GigabitEthernet0/0"', () => {
    expect(matches('interface', 'interface GigabitEthernet0/0')).toBe(true);
  });

  it('does not match a sub-interface line — item_pattern [^.]*$ excludes dot-containing names', () => {
    // [^.]*$ does not match strings containing a dot, so sub-interfaces are excluded
    expect(matches('interface', 'interface GigabitEthernet0/0.100')).toBe(
      false,
    );
  });
});

// ----- sub_interface -----
describe('symbolsInfo.sub_interface', () => {
  it('matches a sub-interface line', () => {
    expect(matches('sub_interface', 'interface GigabitEthernet0/0.100')).toBe(
      true,
    );
  });

  it('does not match an interface line without a dot', () => {
    expect(matches('sub_interface', 'interface GigabitEthernet0/0')).toBe(
      false,
    );
  });
});
