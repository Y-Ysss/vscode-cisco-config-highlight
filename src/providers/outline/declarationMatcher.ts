import type { OutlineCategory } from './outlineTypes';

export interface DeclarationMatch {
  category: Exclude<OutlineCategory, 'command'>;
  detail: string;
  name: string;
  startCharacter: number;
  endCharacter: number;
}

export const PROMPT_PATTERN =
  /^[0-9a-z][0-9a-z._-]*(?:\((?<mode>[^\r\n()]+)\))?[#>](?<command>.*)$/i;

const SHOW_COMMAND_PATTERN = /^(?:do\s+)?(?:sh|sho|show)\b/i;
const CONFIGURATION_SHOW_COMMAND_PATTERN = /^do\s+(?:sh|sho|show)\b/i;

export const isShowCommand = (command: string): boolean =>
  SHOW_COMMAND_PATTERN.test(command);

export const isConfigurationShowCommand = (command: string): boolean =>
  CONFIGURATION_SHOW_COMMAND_PATTERN.test(command);

export const CATEGORY_NAMES: Record<
  Exclude<OutlineCategory, 'command'>,
  string
> = {
  ip_vrf: 'ip vrf',
  router_bgp: 'router bgp',
  address_family: 'address-family',
  class_map: 'class-map',
  policy_map: 'policy-map',
  interface: 'interface',
  sub_interface: 'interface',
  route_map: 'route-map',
  ip_prefix_list: 'ip prefix-list',
};

export const matchDeclaration = (
  line: string,
  startCharacter: number,
): DeclarationMatch | undefined => {
  const text = line.slice(startCharacter);
  const prefix = text.slice(0, 2).toLowerCase();
  let match: RegExpMatchArray | null = null;
  let category: DeclarationMatch['category'] | undefined;
  let detail = '';

  switch (prefix) {
    case 'ad':
      match = text.match(/^address-family[ \t]+(?<name>.+?)\s*$/i);
      category = 'address_family';
      detail = 'address-family';
      break;
    case 'cl':
      match = text.match(/^class-map[ \t]+(?<name>.+?)\s*$/i);
      category = 'class_map';
      detail = 'class-map';
      break;
    case 'in':
      match = text.match(/^interface[ \t]+(?<name>.+?)\s*$/i);
      if (match?.groups) {
        category = match.groups.name.includes('.')
          ? 'sub_interface'
          : 'interface';
      }
      detail = category === 'sub_interface' ? 'sub-interface' : 'interface';
      break;
    case 'ip':
      match = text.match(
        /^ip[ \t]+vrf(?![ \t]+forwarding(?:[ \t]|$))[ \t]+(?<name>.+?)\s*$/i,
      );
      if (match) {
        category = 'ip_vrf';
        detail = 'ip vrf';
      } else {
        match = text.match(/^ip[ \t]+prefix-list[ \t]+(?<name>.+?)\s*$/i);
        category = 'ip_prefix_list';
        detail = 'ip prefix-list';
      }
      break;
    case 'po':
      match = text.match(/^policy-map[ \t]+(?<name>.+?)\s*$/i);
      category = 'policy_map';
      detail = 'policy-map';
      break;
    case 'ro':
      match = text.match(/^router[ \t]+bgp[ \t]+(?<name>.+?)\s*$/i);
      if (match) {
        category = 'router_bgp';
        detail = 'router bgp';
      } else {
        match = text.match(/^route-map[ \t]+(?<name>.+?)\s*$/i);
        category = 'route_map';
        detail = 'route-map';
      }
      break;
    default:
      return undefined;
  }

  if (!match?.groups || !category) return undefined;
  return {
    category,
    detail,
    name: match.groups.name,
    startCharacter,
    endCharacter: line.trimEnd().length,
  };
};
