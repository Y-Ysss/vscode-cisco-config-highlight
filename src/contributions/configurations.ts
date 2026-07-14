export const EXTENSION_ID = 'cisco-config-highlight' as const;

const fq = <T extends string>(config: T) =>
  `${EXTENSION_ID}.${config}` as const;

export const Configurations = {
  outlineShowSymbolsInOutlinePanel: 'outline.showSymbolsInOutlinePanel',
  outlineSymbolsList: 'outline.symbolsList',
  outlineMaxFileSizeForFullScan: 'outline.maxFileSizeForFullScan',
} as const;

export const toFullConfigKey = <T extends string>(config: T) => fq(config);
