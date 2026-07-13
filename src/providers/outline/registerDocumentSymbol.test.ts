import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { EnabledOutlineCategories } from './outlineExtractor';
import {
  CiscoConfigDocumentSymbolProviderForTest,
  normalizeEnabledCategoriesForTest,
  registerDocumentSymbolProvider,
} from './registerDocumentSymbol';

const makeDocument = (
  lines: string[],
  lineAt = vi.fn((index: number) => ({ text: lines[index] })),
) => ({
  lineCount: lines.length,
  lineAt,
});

const token = (isCancellationRequested = false) => ({
  isCancellationRequested,
});

describe('normalizeEnabledCategories', () => {
  it('preserves selections and defaults missing existing and new keys to true', () => {
    expect(
      normalizeEnabledCategoriesForTest({ command: false, interface: false }),
    ).toEqual({
      command: false,
      ip_vrf: true,
      router_bgp: true,
      address_family: true,
      class_map: true,
      policy_map: true,
      interface: false,
      sub_interface: true,
      route_map: true,
      ip_prefix_list: true,
    } satisfies EnabledOutlineCategories);
  });
});

describe('CiscoConfigDocumentSymbolProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, defaultValue: unknown) =>
        key === 'outline.showSymbolsInOutlinePanel' ? true : defaultValue,
    } as never);
  });

  it('returns before lineAt when the master switch is disabled', () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, defaultValue: unknown) =>
        key === 'outline.showSymbolsInOutlinePanel' ? false : defaultValue,
    } as never);
    const lineAt = vi.fn();

    const result =
      new CiscoConfigDocumentSymbolProviderForTest().provideDocumentSymbols(
        makeDocument(['interface Gi0/0'], lineAt) as never,
        token() as never,
      );

    expect(result).toEqual([]);
    expect(lineAt).not.toHaveBeenCalled();
  });

  it('passes cancellation through and returns no partial symbols', () => {
    const cancellation = { isCancellationRequested: false };
    const lineAt = vi.fn((index: number) => {
      cancellation.isCancellationRequested = true;
      return { text: index === 0 ? 'interface Gi0/0' : '' };
    });

    const result =
      new CiscoConfigDocumentSymbolProviderForTest().provideDocumentSymbols(
        makeDocument(['interface Gi0/0'], lineAt) as never,
        cancellation as never,
      );

    expect(result).toEqual([]);
    expect(lineAt).toHaveBeenCalledTimes(1);
  });

  it('adapts document lines without copying and returns representative output hierarchy', () => {
    const lines = ['Router#show run', 'interface Gi0/0', 'interface Gi0/0.10'];
    const lineAt = vi.fn((index: number) => ({ text: lines[index] }));

    const result =
      new CiscoConfigDocumentSymbolProviderForTest().provideDocumentSymbols(
        makeDocument(lines, lineAt) as never,
        token() as never,
      );

    expect(lineAt.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'show run',
      kind: vscode.SymbolKind.Event,
    });
    expect(result[0].children[0]).toMatchObject({
      name: 'interface',
      kind: vscode.SymbolKind.Namespace,
    });
    expect(result[0].children[0].children[0]).toMatchObject({
      name: 'Gi0/0',
      kind: vscode.SymbolKind.Class,
    });
    expect(result[0].children[0].children[0].children[0]).toMatchObject({
      name: 'Gi0/0.10',
      kind: vscode.SymbolKind.Interface,
    });
  });

  it('reads symbol settings for every request so changes are never stale', () => {
    let interfaceEnabled = false;
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, defaultValue: unknown) => {
        if (key === 'outline.showSymbolsInOutlinePanel') return true;
        if (key === 'outline.symbolsList')
          return { interface: interfaceEnabled };
        return defaultValue;
      },
    } as never);
    const provider = new CiscoConfigDocumentSymbolProviderForTest();
    const document = makeDocument(['interface Gi0/0']) as never;

    expect(provider.provideDocumentSymbols(document, token() as never)).toEqual(
      [],
    );
    interfaceEnabled = true;
    expect(
      provider.provideDocumentSymbols(document, token() as never),
    ).toHaveLength(1);
  });
});

describe('registerDocumentSymbolProvider', () => {
  it('registers the cisco selector and wires both disposables to subscriptions', () => {
    const providerDisposable = { dispose: vi.fn() };
    const configurationDisposable = { dispose: vi.fn() };
    const register = vi
      .spyOn(vscode.languages, 'registerDocumentSymbolProvider')
      .mockReturnValue(providerDisposable);
    const onConfiguration = vi
      .spyOn(vscode.workspace, 'onDidChangeConfiguration')
      .mockReturnValue(configurationDisposable);
    const context = { subscriptions: [] as { dispose(): void }[] };

    registerDocumentSymbolProvider(context as never);

    expect(register).toHaveBeenCalledWith(
      { language: 'cisco' },
      expect.any(CiscoConfigDocumentSymbolProviderForTest),
    );
    expect(onConfiguration).toHaveBeenCalledOnce();
    expect(context.subscriptions).toEqual([
      providerDisposable,
      configurationDisposable,
    ]);
  });
});
