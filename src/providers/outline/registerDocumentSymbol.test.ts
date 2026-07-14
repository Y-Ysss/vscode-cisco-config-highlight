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
  getText: vi.fn(() => lines.join('\n')),
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

  it('full-scans at the exact byte threshold and truncates at threshold plus one', () => {
    let threshold = 31;
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, defaultValue: unknown) => {
        if (key === 'outline.showSymbolsInOutlinePanel') return true;
        if (key === 'outline.maxFileSizeForFullScan') return threshold;
        return defaultValue;
      },
    } as never);
    const provider = new CiscoConfigDocumentSymbolProviderForTest();
    const exact = makeDocument(['interface Gi0/0', 'interface Gi0/1']) as never;

    expect(
      provider.provideDocumentSymbols(exact, token() as never).at(-1)?.name,
    ).not.toBe('Truncated output (see settings for max output size)');

    threshold = 30;
    const truncated = provider.provideDocumentSymbols(exact, token() as never);
    expect(truncated.at(-1)).toMatchObject({
      name: 'Truncated output (see settings for max output size)',
      detail: '',
      kind: vscode.SymbolKind.String,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 15 },
      },
      selectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 15 },
      },
      children: [],
    });
    expect(
      truncated.flatMap(({ children }) => children.map(({ name }) => name)),
    ).toContain('Gi0/0');
    expect(
      truncated.flatMap(({ children }) => children.map(({ name }) => name)),
    ).not.toContain('Gi0/1');
  });

  it('uses UTF-8 bytes and never splits text into a line array', () => {
    const split = vi.spyOn(String.prototype, 'split');
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, defaultValue: unknown) => {
        if (key === 'outline.showSymbolsInOutlinePanel') return true;
        if (key === 'outline.maxFileSizeForFullScan') return 4;
        return defaultValue;
      },
    } as never);
    const document = makeDocument(['a', '\u3042', 'interface Gi0/1']);
    const result =
      new CiscoConfigDocumentSymbolProviderForTest().provideDocumentSymbols(
        document as never,
        token() as never,
      );

    expect(document.getText).toHaveBeenCalledOnce();
    expect(document.lineAt.mock.calls.map(([index]) => index)).toEqual([0]);
    expect(result.some(({ name }) => name === 'interface')).toBe(false);
    expect(split).not.toHaveBeenCalled();
    split.mockRestore();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to the default threshold for invalid configured value %s',
    (configured) => {
      vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
        get: (key: string, defaultValue: unknown) => {
          if (key === 'outline.showSymbolsInOutlinePanel') return true;
          if (key === 'outline.maxFileSizeForFullScan') return configured;
          return defaultValue;
        },
      } as never);

      const result =
        new CiscoConfigDocumentSymbolProviderForTest().provideDocumentSymbols(
          makeDocument(['interface Gi0/0']) as never,
          token() as never,
        );

      expect(result.at(-1)?.name).not.toBe('この先は省略されています');
    },
  );

  it('returns empty on cancellation in truncated mode without notifications', () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, defaultValue: unknown) => {
        if (key === 'outline.showSymbolsInOutlinePanel') return true;
        if (key === 'outline.maxFileSizeForFullScan') return 1;
        return defaultValue;
      },
    } as never);
    const notification = vi.spyOn(vscode.window, 'showInformationMessage');

    expect(
      new CiscoConfigDocumentSymbolProviderForTest().provideDocumentSymbols(
        makeDocument(['interface Gi0/0']) as never,
        token(true) as never,
      ),
    ).toEqual([]);
    expect(notification).not.toHaveBeenCalled();
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
