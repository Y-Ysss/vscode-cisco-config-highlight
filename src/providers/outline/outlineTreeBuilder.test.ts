import { describe, expect, it } from 'vitest';
import type { DeclarationMatch } from './declarationMatcher';
import { OutlineTreeBuilder } from './outlineTreeBuilder';

const declaration = (
  category: DeclarationMatch['category'],
  name: string,
  detail: string,
): DeclarationMatch => ({
  category,
  name,
  detail,
  startCharacter: 0,
  endCharacter: name.length,
});

describe('OutlineTreeBuilder', () => {
  it('groups declarations by category and starts a new category section', () => {
    const tree = new OutlineTreeBuilder();
    const scope = tree.createRootScope();

    tree.startCategory(scope, 'interface');
    tree.addDeclaration(
      scope,
      declaration('interface', 'Gi0/0', 'interface'),
      0,
    );
    tree.addDeclaration(
      scope,
      declaration('interface', 'Gi0/1', 'interface'),
      1,
    );
    tree.startCategory(scope, 'policy_map');
    tree.addDeclaration(
      scope,
      declaration('policy_map', 'WAN', 'policy-map'),
      2,
    );
    tree.startCategory(scope, 'interface');
    tree.addDeclaration(
      scope,
      declaration('interface', 'Gi0/2', 'interface'),
      3,
    );

    expect(
      tree.symbols.map((symbol) => symbol.children.map((child) => child.name)),
    ).toEqual([['Gi0/0', 'Gi0/1'], ['WAN'], ['Gi0/2']]);
  });

  it('nests a declaration and extends all ancestor ranges', () => {
    const tree = new OutlineTreeBuilder();
    const scope = tree.createRootScope();
    tree.startCategory(scope, 'router_bgp');
    const router = tree.addDeclaration(
      scope,
      declaration('router_bgp', '65000', 'router bgp'),
      0,
    );
    const addressFamily = tree.addDeclaration(
      scope,
      declaration('address_family', 'ipv4', 'address-family'),
      1,
      router,
    );

    tree.extendRange(addressFamily, { line: 2, character: 20 });

    expect(addressFamily.range.end).toEqual({ line: 2, character: 20 });
    expect(router.range.end).toEqual({ line: 2, character: 20 });
    expect(tree.symbols[0].range.end).toEqual({ line: 2, character: 20 });
  });
});
