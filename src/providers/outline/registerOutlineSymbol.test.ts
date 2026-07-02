import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted: evaluated before vi.mock factories so the factory can reference mockConfig
const { mockConfig } = vi.hoisted(() => {
  const mockConfig = {
    showSymbolsInOutlinePanel: true as boolean,
    symbolsList: {} as Record<string, boolean>,
  };
  return { mockConfig };
});

// Override only workspace on top of mocks/vscode.ts to allow per-test config
vi.mock('vscode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../mocks/vscode')>();
  return {
    ...actual,
    workspace: {
      getConfiguration: (_section: string) => ({
        get: (key: string, defaultValue: unknown): unknown => {
          if (key === 'outline.showSymbolsInOutlinePanel') {
            return mockConfig.showSymbolsInOutlinePanel;
          }
          if (key === 'outline.symbolsList') {
            return mockConfig.symbolsList;
          }
          return defaultValue;
        },
      }),
    },
  };
});

import {
  CiscoConfigDocumentSymbolProviderForTest,
  invalidatePatternCacheForTest,
} from './registerOutlineSymbol';

// --- Helpers ---

function makeDocument(lines: string[]) {
  return {
    lineCount: lines.length,
    lineAt: (i: number) => ({
      text: lines[i],
      range: { start: { line: i }, end: { line: i } },
    }),
  };
}

const ALL_DISABLED: Record<string, boolean> = {
  command: false,
  ip_vrf: false,
  router_bgp: false,
  address_family: false,
  class_map: false,
  policy_map: false,
  interface: false,
  sub_interface: false,
};

// --- Tests ---

describe('CiscoConfigDocumentSymbolProvider.provideDocumentSymbols', () => {
  beforeEach(() => {
    mockConfig.showSymbolsInOutlinePanel = true;
    mockConfig.symbolsList = { ...ALL_DISABLED };
    invalidatePatternCacheForTest(); // reset cache between tests
  });

  describe('when settings are disabled', () => {
    it('returns an empty array when showSymbolsInOutlinePanel is false', async () => {
      mockConfig.showSymbolsInOutlinePanel = false;
      mockConfig.symbolsList = { ...ALL_DISABLED, command: true };
      const provider = new CiscoConfigDocumentSymbolProviderForTest();
      const result = await provider.provideDocumentSymbols(
        makeDocument(['Router#show running-config']) as never,
        {} as never,
      );
      expect(result).toEqual([]);
    });

    it('returns an empty array when all symbolsList entries are false', async () => {
      const provider = new CiscoConfigDocumentSymbolProviderForTest();
      const result = await provider.provideDocumentSymbols(
        makeDocument([
          'Router#show running-config',
          'interface GigabitEthernet0/0',
        ]) as never,
        {} as never,
      );
      expect(result).toEqual([]);
    });
  });

  describe('command symbols', () => {
    beforeEach(() => {
      mockConfig.symbolsList = { ...ALL_DISABLED, command: true };
    });

    it('detects a command line as a root symbol', async () => {
      const provider = new CiscoConfigDocumentSymbolProviderForTest();
      const result = await provider.provideDocumentSymbols(
        makeDocument([
          'Router#show running-config',
          'Building configuration...',
        ]) as never,
        {} as never,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('show running-config');
      expect(result[0].detail).toBe('command');
    });

    it('detects multiple prompts as separate root symbols', async () => {
      const provider = new CiscoConfigDocumentSymbolProviderForTest();
      const result = await provider.provideDocumentSymbols(
        makeDocument([
          'Router#show running-config',
          'output...',
          'Switch>show ip interface brief',
        ]) as never,
        {} as never,
      );
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('show running-config');
      expect(result[1].name).toBe('show ip interface brief');
    });

    it('does not add a bare prompt line (no command) as a symbol', async () => {
      const provider = new CiscoConfigDocumentSymbolProviderForTest();
      const result = await provider.provideDocumentSymbols(
        makeDocument(['Router#']) as never,
        {} as never,
      );
      expect(result).toEqual([]);
    });
  });

  describe('interface symbols', () => {
    beforeEach(() => {
      mockConfig.symbolsList = { ...ALL_DISABLED, interface: true };
    });

    it('detects multiple interface lines as children under the category node', async () => {
      const provider = new CiscoConfigDocumentSymbolProviderForTest();
      const result = await provider.provideDocumentSymbols(
        makeDocument([
          'interface GigabitEthernet0/0',
          ' description uplink',
          'interface GigabitEthernet0/1',
        ]) as never,
        {} as never,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('interface');
      expect(result[0].children).toHaveLength(2);
      expect(result[0].children[0].name).toBe('GigabitEthernet0/0');
      expect(result[0].children[1].name).toBe('GigabitEthernet0/1');
    });
  });

  describe('sub_interface symbols', () => {
    beforeEach(() => {
      mockConfig.symbolsList = {
        ...ALL_DISABLED,
        interface: true,
        sub_interface: true,
      };
    });

    it('detects a sub-interface as a child of the parent interface', async () => {
      const provider = new CiscoConfigDocumentSymbolProviderForTest();
      const result = await provider.provideDocumentSymbols(
        makeDocument([
          'interface GigabitEthernet0/0',
          'interface GigabitEthernet0/0.100',
        ]) as never,
        {} as never,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('interface');
      // GigabitEthernet0/0.100 becomes a child of GigabitEthernet0/0
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe('GigabitEthernet0/0');
      expect(result[0].children[0].children[0].name).toBe(
        'GigabitEthernet0/0.100',
      );
    });
  });

  describe('router_bgp + address_family symbols', () => {
    beforeEach(() => {
      mockConfig.symbolsList = {
        ...ALL_DISABLED,
        router_bgp: true,
        address_family: true,
      };
    });

    it('detects address-family entries as children under router bgp', async () => {
      const provider = new CiscoConfigDocumentSymbolProviderForTest();
      const result = await provider.provideDocumentSymbols(
        makeDocument([
          'router bgp 65000',
          ' address-family ipv4',
          ' address-family vpnv4 unicast',
        ]) as never,
        {} as never,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('router bgp');
      expect(result[0].children[0].name).toBe('65000');
      expect(result[0].children[0].children).toHaveLength(2);
      expect(result[0].children[0].children[0].name).toBe('ipv4');
      expect(result[0].children[0].children[1].name).toBe('vpnv4 unicast');
    });
  });
});
