import type { OutlineCategory } from './outlineTypes';

export interface DeclarationMatch {
  category: Exclude<OutlineCategory, 'command'>;
  detail: string;
  name: string;
  childName?: string;
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
  router_ospf: 'router ospf',
  address_family: 'address-family',
  class_map: 'class-map',
  policy_map: 'policy-map',
  policy_class: 'class',
  interface: 'interface',
  sub_interface: 'interface',
  route_map: 'route-map',
  ip_prefix_list: 'ip prefix-list',
  ip_access_list: 'IPv4 access-list',
  access_list_entry: 'access-list entry',
};

const numberedAclKind = (
  value: string,
): 'standard' | 'extended' | undefined => {
  if (!/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  if ((number >= 1 && number <= 99) || (number >= 1300 && number <= 1999)) {
    return 'standard';
  }
  if ((number >= 100 && number <= 199) || (number >= 2000 && number <= 2699)) {
    return 'extended';
  }
  return undefined;
};

export const matchDeclaration = (
  line: string,
  startCharacter: number,
): DeclarationMatch | undefined => {
  const text = line.slice(startCharacter);
  const prefix = text.slice(0, 2).toLowerCase();
  const aclEntryMatch = text.match(
    /^(?<name>(?:\d+[ \t]+)?(?:permit|deny|remark)(?:[ \t]+.*?)?)\s*$/i,
  );
  if (aclEntryMatch?.groups) {
    return {
      category: 'access_list_entry',
      detail: 'access-list entry',
      name: aclEntryMatch.groups.name,
      childName: undefined,
      startCharacter,
      endCharacter: line.trimEnd().length,
    };
  }
  let match: RegExpMatchArray | null = null;
  let category: DeclarationMatch['category'] | undefined;
  let detail = '';

  switch (prefix) {
    case 'ac': {
      match = text.match(
        /^access-list[ \t]+(?<name>\d+)[ \t]+(?<childName>.+?)\s*$/i,
      );
      const aclKind = match?.groups
        ? numberedAclKind(match.groups.name)
        : undefined;
      if (aclKind) {
        category = 'ip_access_list';
        detail = `${aclKind} access-list`;
      }
      break;
    }
    case 'ad':
      match = text.match(/^address-family[ \t]+(?<name>.+?)\s*$/i);
      category = 'address_family';
      detail = 'address-family';
      break;
    case 'cl':
      match = text.match(/^class-map[ \t]+(?<name>.+?)\s*$/i);
      if (match) {
        category = 'class_map';
        detail = 'class-map';
      } else {
        match = text.match(/^class[ \t]+(?<name>.+?)\s*$/i);
        category = 'policy_class';
        detail = 'class';
      }
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
        match = text.match(
          /^ip[ \t]+access-list[ \t]+(?<aclKind>standard|extended)[ \t]+(?<name>\S+)\s*$/i,
        );
        if (match?.groups) {
          category = 'ip_access_list';
          detail = `${match.groups.aclKind.toLowerCase()} access-list`;
        } else {
          match = text.match(
            /^ip[ \t]+prefix-list[ \t]+(?<name>\S+)(?:[ \t]+(?<childName>.+?))?\s*$/i,
          );
          category = 'ip_prefix_list';
          detail = 'ip prefix-list';
        }
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
        match = text.match(/^router[ \t]+ospf[ \t]+(?<name>.+?)\s*$/i);
        if (match) {
          category = 'router_ospf';
          detail = 'router ospf';
        } else {
          match = text.match(/^route-map[ \t]+(?<name>.+?)\s*$/i);
          category = 'route_map';
          detail = 'route-map';
        }
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
    childName: match.groups.childName,
    startCharacter,
    endCharacter: line.trimEnd().length,
  };
};
