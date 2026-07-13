import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIAGNOSTICS_MAX_FILE_SIZE_FOR_FULL_SCAN,
  DEFAULT_OUTLINE_MAX_FILE_SIZE_FOR_FULL_SCAN,
} from '../config';
import {
  Configurations,
  EXTENSION_ID,
  toFullConfigKey,
} from './configurations';

type JsonObject = Record<string, unknown>;

const readJson = (file: string): JsonObject =>
  JSON.parse(readFileSync(resolve(file), 'utf8')) as JsonObject;

const packageJson = readJson('package.json');
const english = readJson('package.nls.json');
const japanese = readJson('package.nls.ja.json');

const configurationProperties = (
  (packageJson.contributes as JsonObject).configuration as JsonObject[]
)[0].properties as JsonObject;

const canonicalOutlineCategories = [
  'command',
  'ip_vrf',
  'router_bgp',
  'address_family',
  'class_map',
  'policy_map',
  'interface',
  'sub_interface',
  'route_map',
  'ip_prefix_list',
] as const;

const expectedConfigurationSuffixes = [
  'outline.showSymbolsInOutlinePanel',
  'outline.symbolsList',
  'outline.maxFileSizeForFullScan',
  'diagnostics.enabled',
  'diagnostics.maxFileSizeForFullScan',
  'diagnostics.allowNonContiguousMask',
] as const;

const expectedSettings = [
  {
    internal: Configurations.outlineShowSymbolsInOutlinePanel,
    type: 'boolean',
    defaultValue: false,
    placeholder:
      'configuration.properties.showSymbolsInOutlinePanel.description',
  },
  {
    internal: Configurations.outlineSymbolsList,
    type: 'object',
    defaultValue: {
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
    },
    placeholder:
      'configuration.properties.showEnableDisableSymbols.description',
  },
  {
    internal: Configurations.outlineMaxFileSizeForFullScan,
    type: 'number',
    defaultValue: DEFAULT_OUTLINE_MAX_FILE_SIZE_FOR_FULL_SCAN,
    placeholder:
      'configuration.properties.outline.maxFileSizeForFullScan.description',
  },
  {
    internal: Configurations.diagnosticsMaxFileSizeForFullScan,
    type: 'number',
    defaultValue: DEFAULT_DIAGNOSTICS_MAX_FILE_SIZE_FOR_FULL_SCAN,
    placeholder:
      'configuration.properties.diagnostics.maxFileSizeForFullScan.description',
  },
  {
    internal: Configurations.diagnosticsAllowNonContiguousMask,
    type: 'boolean',
    defaultValue: false,
    placeholder:
      'configuration.properties.diagnostics.allowNonContiguousMask.description',
  },
  {
    internal: Configurations.diagnosticsEnabled,
    type: 'boolean',
    defaultValue: true,
    placeholder: 'configuration.properties.diagnostics.enabled.description',
  },
] as const;

describe('configuration contribution manifest', () => {
  it('publishes exactly the expected settings and internal suffixes', () => {
    expect(Object.values(Configurations).toSorted()).toEqual(
      expectedConfigurationSuffixes.toSorted(),
    );
    expect(Object.keys(configurationProperties).toSorted()).toEqual(
      expectedConfigurationSuffixes
        .map((suffix) => `${EXTENSION_ID}.${suffix}`)
        .toSorted(),
    );
  });

  it.each(expectedSettings)(
    'publishes $internal with its internal suffix, default, and localized description',
    ({ internal, type, defaultValue, placeholder }) => {
      const fullKey = toFullConfigKey(internal);
      expect(fullKey).toBe(`${EXTENSION_ID}.${internal}`);

      const setting = configurationProperties[fullKey] as JsonObject;
      expect(setting).toMatchObject({
        type,
        default: defaultValue,
        description: `%${placeholder}%`,
      });
      expect(english[placeholder]).toEqual(expect.any(String));
      expect(japanese[placeholder]).toEqual(expect.any(String));
    },
  );

  it('publishes every Outline symbol category with a true default and localization', () => {
    const symbols = configurationProperties[
      toFullConfigKey(Configurations.outlineSymbolsList)
    ] as JsonObject;
    const properties = symbols.properties as JsonObject;
    const defaults = symbols.default as JsonObject;

    const placeholders = Object.values(properties).map((value) => {
      expect(value).toMatchObject({ type: 'boolean', default: true });
      return (value as JsonObject).description;
    });

    expect(defaults).toEqual(
      Object.fromEntries(Object.keys(properties).map((key) => [key, true])),
    );
    expect(Object.keys(properties).toSorted()).toEqual(
      canonicalOutlineCategories.toSorted(),
    );
    expect(Object.keys(defaults).toSorted()).toEqual(
      canonicalOutlineCategories.toSorted(),
    );

    for (const description of placeholders) {
      expect(description).toMatch(/^%[^%]+%$/);
      const placeholder = (description as string).slice(1, -1);
      expect(english[placeholder]).toEqual(expect.any(String));
      expect(japanese[placeholder]).toEqual(expect.any(String));
    }
  });

  it('has no unresolved or unused configuration localization placeholders', () => {
    const manifestPlaceholders = JSON.stringify(configurationProperties).match(
      /%([^%]+)%/g,
    );
    const keys = manifestPlaceholders?.map((value) => value.slice(1, -1)) ?? [];

    expect(new Set(keys)).toEqual(new Set(Object.keys(english)));
    expect(new Set(keys)).toEqual(new Set(Object.keys(japanese)));
  });
});
