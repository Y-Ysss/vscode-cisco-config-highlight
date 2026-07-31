export type { LineSource } from '../../parser/lineScanUtils';

export const OUTLINE_CATEGORIES = [
  'command',
  'ip_vrf',
  'router_bgp',
  'router_ospf',
  'address_family',
  'class_map',
  'policy_map',
  'policy_class',
  'interface',
  'sub_interface',
  'route_map',
  'ip_prefix_list',
] as const;

export type OutlineCategory = (typeof OUTLINE_CATEGORIES)[number];
export type OutlineSymbolType = 'category' | 'truncation' | OutlineCategory;
export type OutlineSymbolCategory = OutlineCategory | 'truncation';

export interface OutlinePosition {
  line: number;
  character: number;
}

export interface OutlineRange {
  start: OutlinePosition;
  end: OutlinePosition;
}

export interface OutlineSymbol {
  category: OutlineSymbolCategory;
  type: OutlineSymbolType;
  name: string;
  detail: string;
  range: OutlineRange;
  selectionRange: OutlineRange;
  children: OutlineSymbol[];
}

export type EnabledOutlineCategories = Record<OutlineCategory, boolean>;

export interface OutlineDocumentMeasurement {
  byteSize: number;
  prefixLineCount: number;
}
