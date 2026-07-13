import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  diagnosticsInternalsForTest,
  registerDiagnostics,
} from './registerDiagnostics';

const makeDocument = (lines: string[], id = 'file:///config.cisco') => {
  const lineAt = vi.fn((line: number) => ({ text: lines[line] }));
  return {
    languageId: 'cisco',
    lineCount: lines.length,
    uri: { toString: () => id },
    getText: vi.fn(() => lines.join('\n')),
    lineAt,
  };
};

describe('diagnostic scan internals', () => {
  it('takes one stable range snapshot and all rules independently preserve offsets and order', () => {
    const document = makeDocument([
      '',
      '',
      '',
      '',
      '',
      'ip address 999.0.0.1 255.255.255.0',
      'ipv6 address 2001:12345::1/129',
      'access-list 1 permit 999.0.0.1 0.0.0.255',
      'object-group network IOS',
      ' network-object host bogus',
    ]);
    const snapshots = diagnosticsInternalsForTest.snapshotRanges(
      document as never,
      [{ start: 5, end: 9 }],
      () => false,
    );
    expect(snapshots).not.toBeNull();

    const findings = diagnosticsInternalsForTest.scanSnapshots(
      snapshots ?? [],
      false,
      () => false,
    );

    expect(document.lineAt.mock.calls.map(([line]) => line)).toEqual([
      5, 6, 7, 8, 9,
    ]);
    expect(findings?.map(({ line, code }) => ({ line, code }))).toEqual(
      expect.arrayContaining([
        { line: 5, code: 'invalid-ipv4' },
        { line: 6, code: 'invalid-ipv6' },
        { line: 7, code: 'invalid-ipv4' },
        { line: 9, code: 'invalid-ipv4' },
      ]),
    );
    const findingLines = findings?.map(({ line }) => line) ?? [];
    expect(findingLines).toEqual(
      [...findingLines].sort((left, right) => left - right),
    );
  });

  it('routes allowNonContiguousMask only to IPv4 and IOS object-group rules', () => {
    const snapshots = [
      {
        start: 0,
        lines: [
          'ip address 10.0.0.1 255.0.255.0',
          'object-group network IOS',
          ' network-object 10.0.0.0 255.0.255.0',
          'ip prefix-list BAD permit 10.0.0.0/8 mask 255.0.999.0',
        ],
      },
    ];
    const strict = diagnosticsInternalsForTest.scanSnapshots(
      snapshots,
      false,
      () => false,
    );
    const relaxed = diagnosticsInternalsForTest.scanSnapshots(
      snapshots,
      true,
      () => false,
    );

    expect(
      strict?.filter(({ code }) => code === 'non-contiguous-subnet-mask'),
    ).toHaveLength(2);
    expect(
      relaxed?.filter(({ code }) => code === 'non-contiguous-subnet-mask'),
    ).toHaveLength(0);
    const expectedRouteMatchFinding = {
      line: 3,
      start: 42,
      end: 53,
      code: 'invalid-route-match-mask',
      message: 'Invalid route-match mask.',
      severity: 'error',
    };
    expect(
      strict?.filter(({ code }) => code === 'invalid-route-match-mask'),
    ).toEqual([expectedRouteMatchFinding]);
    expect(
      relaxed?.filter(({ code }) => code === 'invalid-route-match-mask'),
    ).toEqual([expectedRouteMatchFinding]);
  });

  it('merges all-editor buffered ranges with clamp and adjacency', () => {
    const document = makeDocument(Array.from({ length: 1000 }, () => ''));
    vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([
      {
        document,
        visibleRanges: [new vscode.Range(250, 0, 300, 0)],
      },
      {
        document,
        visibleRanges: [new vscode.Range(701, 0, 900, 0)],
      },
    ] as never);

    expect(
      diagnosticsInternalsForTest.visibleLineRanges(document as never),
    ).toEqual([{ start: 50, end: 999 }]);
  });
});

describe('registerDiagnostics lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces activation/change, replaces results, closes safely, and wires cleanup', () => {
    const document = makeDocument(['ip address 999.0.0.1 255.255.255.0']);
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      document,
    ] as never);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (_key: string, fallback: unknown) => fallback,
    } as never);
    const collection = {
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.spyOn(vscode.languages, 'createDiagnosticCollection').mockReturnValue(
      collection as never,
    );
    let change: ((event: { document: typeof document }) => void) | undefined;
    let close: ((closed: typeof document) => void) | undefined;
    vi.spyOn(vscode.workspace, 'onDidChangeTextDocument').mockImplementation(((
      listener: typeof change,
    ) => {
      change = listener;
      return { dispose: vi.fn() };
    }) as never);
    vi.spyOn(vscode.workspace, 'onDidCloseTextDocument').mockImplementation(((
      listener: typeof close,
    ) => {
      close = listener;
      return { dispose: vi.fn() };
    }) as never);
    const context = { subscriptions: [] as { dispose(): void }[] };

    registerDiagnostics(context as never);
    expect(context.subscriptions).toHaveLength(7);
    vi.advanceTimersByTime(399);
    expect(collection.set).not.toHaveBeenCalled();
    change?.({ document });
    vi.advanceTimersByTime(399);
    expect(collection.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(collection.set).toHaveBeenCalledOnce();
    expect(collection.set.mock.calls[0][1]).toEqual([
      expect.objectContaining({ code: 'invalid-ipv4' }),
    ]);

    change?.({ document });
    close?.(document);
    vi.advanceTimersByTime(400);
    expect(collection.set).toHaveBeenCalledOnce();
    expect(collection.delete).toHaveBeenCalledWith(document.uri);
    context.subscriptions.at(-1)?.dispose();
  });

  it('deletes instead of claiming ranges for a large document with no editor', () => {
    const document = makeDocument(['あ']);
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      document,
    ] as never);
    vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([]);
    const notification = vi.spyOn(vscode.window, 'showInformationMessage');
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) =>
        key === 'diagnostics.maxFileSizeForFullScan' ? 2 : fallback,
    } as never);
    const collection = {
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.spyOn(vscode.languages, 'createDiagnosticCollection').mockReturnValue(
      collection as never,
    );

    registerDiagnostics({ subscriptions: [] } as never);
    vi.advanceTimersByTime(400);

    expect(collection.delete).toHaveBeenCalledWith(document.uri);
    expect(collection.set).not.toHaveBeenCalled();
    expect(document.lineAt).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
  });

  it('invokes open and configuration listeners, clears while disabled, and revalidates when enabled', () => {
    const existing = makeDocument(['ip address 999.0.0.1 255.255.255.0']);
    const opened = makeDocument(
      ['ipv6 address 2001:12345::1/129'],
      'file:///opened.cisco',
    );
    let enabled = true;
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      existing,
      opened,
    ] as never);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) =>
        key === 'diagnostics.enabled' ? enabled : fallback,
    } as never);
    const collection = {
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.spyOn(vscode.languages, 'createDiagnosticCollection').mockReturnValue(
      collection as never,
    );
    let open: ((document: typeof opened) => void) | undefined;
    let configuration:
      | ((event: { affectsConfiguration(section: string): boolean }) => void)
      | undefined;
    vi.spyOn(vscode.workspace, 'onDidOpenTextDocument').mockImplementation(((
      listener: typeof open,
    ) => {
      open = listener;
      return { dispose: vi.fn() };
    }) as never);
    vi.spyOn(vscode.workspace, 'onDidChangeConfiguration').mockImplementation(((
      listener: typeof configuration,
    ) => {
      configuration = listener;
      return { dispose: vi.fn() };
    }) as never);

    registerDiagnostics({ subscriptions: [] } as never);
    vi.advanceTimersByTime(400);
    expect(collection.set).toHaveBeenCalledTimes(2);

    open?.(opened);
    vi.advanceTimersByTime(399);
    expect(collection.set).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(collection.set).toHaveBeenCalledTimes(3);

    enabled = false;
    configuration?.({
      affectsConfiguration: (section) =>
        section === 'cisco-config-highlight.diagnostics',
    });
    expect(collection.clear).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(400);
    expect(collection.set).toHaveBeenCalledTimes(3);

    enabled = true;
    configuration?.({ affectsConfiguration: () => true });
    vi.advanceTimersByTime(399);
    expect(collection.set).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1);
    expect(collection.set).toHaveBeenCalledTimes(5);
  });

  it('uses full scan at exact UTF-8 threshold and large mode at threshold plus one', () => {
    const exact = makeDocument(['abc'], 'file:///exact.cisco');
    const plusOne = makeDocument(['abcd'], 'file:///plus-one.cisco');
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      exact,
      plusOne,
    ] as never);
    vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([]);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) =>
        key === 'diagnostics.maxFileSizeForFullScan' ? 3 : fallback,
    } as never);
    const collection = {
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.spyOn(vscode.languages, 'createDiagnosticCollection').mockReturnValue(
      collection as never,
    );

    registerDiagnostics({ subscriptions: [] } as never);
    vi.advanceTimersByTime(400);

    expect(exact.lineAt).toHaveBeenCalledOnce();
    expect(collection.set).toHaveBeenCalledWith(exact.uri, []);
    expect(plusOne.lineAt).not.toHaveBeenCalled();
    expect(collection.delete).toHaveBeenCalledWith(plusOne.uri);
  });

  it('coalesces visible-range events without immediate text traversal and replaces scrolled diagnostics', () => {
    const lines = Array.from({ length: 500 }, () => '');
    lines[10] = 'ip address 999.0.0.1 255.255.255.0';
    lines[490] = 'ip address 999.0.0.2 255.255.255.0';
    const document = makeDocument(lines);
    let visibleRanges = [new vscode.Range(0, 0, 0, 0)];
    const editor = {
      document,
      get visibleRanges() {
        return visibleRanges;
      },
    };
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      document,
    ] as never);
    vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockImplementation(
      () => [editor] as never,
    );
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) =>
        key === 'diagnostics.maxFileSizeForFullScan' ? 1 : fallback,
    } as never);
    const collection = {
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.spyOn(vscode.languages, 'createDiagnosticCollection').mockReturnValue(
      collection as never,
    );
    let visible: ((event: { textEditor: typeof editor }) => void) | undefined;
    vi.spyOn(
      vscode.window,
      'onDidChangeTextEditorVisibleRanges',
    ).mockImplementation(((listener: typeof visible) => {
      visible = listener;
      return { dispose: vi.fn() };
    }) as never);

    registerDiagnostics({ subscriptions: [] } as never);
    vi.advanceTimersByTime(400);
    expect(collection.set.mock.calls[0][1]).toEqual([
      expect.objectContaining({
        range: expect.objectContaining({
          start: expect.objectContaining({ line: 10 }),
        }),
      }),
    ]);

    document.getText.mockClear();
    visibleRanges = [new vscode.Range(499, 0, 499, 0)];
    visible?.({ textEditor: editor });
    visible?.({ textEditor: editor });
    expect(document.getText).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(document.getText).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(document.getText).toHaveBeenCalledOnce();
    expect(collection.set).toHaveBeenCalledTimes(2);
    expect(collection.set.mock.calls[1][1]).toEqual([
      expect.objectContaining({
        range: expect.objectContaining({
          start: expect.objectContaining({ line: 490 }),
        }),
      }),
    ]);
  });

  it('cancels a reentrantly stale in-flight generation before publishing', () => {
    const lines = Array.from({ length: 300 }, () => '');
    lines[0] = 'ip address 999.0.0.1 255.255.255.0';
    const document = makeDocument(lines);
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      document,
    ] as never);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (_key: string, fallback: unknown) => fallback,
    } as never);
    const collection = {
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.spyOn(vscode.languages, 'createDiagnosticCollection').mockReturnValue(
      collection as never,
    );
    let change: ((event: { document: typeof document }) => void) | undefined;
    vi.spyOn(vscode.workspace, 'onDidChangeTextDocument').mockImplementation(((
      listener: typeof change,
    ) => {
      change = listener;
      return { dispose: vi.fn() };
    }) as never);
    let interrupted = false;
    document.lineAt.mockImplementation((line) => {
      if (!interrupted) {
        interrupted = true;
        change?.({ document });
      }
      return { text: lines[line] };
    });

    registerDiagnostics({ subscriptions: [] } as never);
    vi.advanceTimersByTime(400);
    expect(collection.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(collection.set).toHaveBeenCalledOnce();
  });

  it('ignores non-Cisco listener events and disposes collection, listeners, and pending work', () => {
    const cisco = makeDocument([], 'file:///pending.cisco');
    const plain = {
      ...makeDocument(['plain'], 'file:///plain.txt'),
      languageId: 'plaintext',
    };
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([]);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (_key: string, fallback: unknown) => fallback,
    } as never);
    const collection = {
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    vi.spyOn(vscode.languages, 'createDiagnosticCollection').mockReturnValue(
      collection as never,
    );
    const listenerDisposals: ReturnType<typeof vi.fn>[] = [];
    let open: ((document: typeof cisco) => void) | undefined;
    let change: ((event: { document: typeof plain }) => void) | undefined;
    let visible:
      | ((event: { textEditor: { document: typeof plain } }) => void)
      | undefined;
    const disposable = () => {
      const dispose = vi.fn();
      listenerDisposals.push(dispose);
      return { dispose };
    };
    vi.spyOn(vscode.workspace, 'onDidOpenTextDocument').mockImplementation(((
      listener: typeof open,
    ) => {
      open = listener;
      return disposable();
    }) as never);
    vi.spyOn(vscode.workspace, 'onDidChangeTextDocument').mockImplementation(((
      listener: typeof change,
    ) => {
      change = listener;
      return disposable();
    }) as never);
    vi.spyOn(vscode.workspace, 'onDidCloseTextDocument').mockReturnValue(
      disposable(),
    );
    vi.spyOn(vscode.workspace, 'onDidChangeConfiguration').mockReturnValue(
      disposable(),
    );
    vi.spyOn(
      vscode.window,
      'onDidChangeTextEditorVisibleRanges',
    ).mockImplementation(((listener: typeof visible) => {
      visible = listener;
      return disposable();
    }) as never);
    const context = { subscriptions: [] as { dispose(): void }[] };

    registerDiagnostics(context as never);
    open?.(plain as never);
    change?.({ document: plain });
    visible?.({ textEditor: { document: plain } });
    open?.(cisco);
    for (const subscription of context.subscriptions) subscription.dispose();
    vi.advanceTimersByTime(400);

    expect(plain.getText).not.toHaveBeenCalled();
    expect(cisco.getText).not.toHaveBeenCalled();
    expect(collection.set).not.toHaveBeenCalled();
    expect(collection.dispose).toHaveBeenCalledOnce();
    expect(listenerDisposals).toHaveLength(5);
    for (const dispose of listenerDisposals)
      expect(dispose).toHaveBeenCalledOnce();
  });
});
