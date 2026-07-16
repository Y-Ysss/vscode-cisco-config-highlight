import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { outputChannel } from '../../channel';
import { registerDiagnostics } from './registerDiagnostics';

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

describe('registerDiagnostics lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces activation/change, replaces results, closes safely, and wires cleanup', async () => {
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
    expect(context.subscriptions).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(399);
    expect(collection.set).not.toHaveBeenCalled();
    change?.({ document });
    await vi.advanceTimersByTimeAsync(399);
    expect(collection.set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(collection.set).toHaveBeenCalledOnce();
    expect(collection.set.mock.calls[0][1]).toEqual([
      expect.objectContaining({ code: 'invalid-ipv4' }),
    ]);

    change?.({ document });
    close?.(document);
    await vi.advanceTimersByTimeAsync(400);
    expect(collection.set).toHaveBeenCalledOnce();
    expect(collection.delete).toHaveBeenCalledWith(document.uri);
    context.subscriptions.at(-1)?.dispose();
  });

  it('scans a document even when it has no visible editor', async () => {
    const document = makeDocument(['ip address 999.0.0.1 255.255.255.0']);
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      document,
    ] as never);
    vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([]);
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

    registerDiagnostics({ subscriptions: [] } as never);
    await vi.advanceTimersByTimeAsync(400);
    await vi.runAllTimersAsync();

    expect(collection.set).toHaveBeenCalledWith(document.uri, [
      expect.objectContaining({ code: 'invalid-ipv4' }),
    ]);
    expect(document.lineAt).toHaveBeenCalledOnce();
  });

  it('invokes open and configuration listeners, clears while disabled, and revalidates when enabled', async () => {
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
    await vi.advanceTimersByTimeAsync(400);
    expect(collection.set).toHaveBeenCalledTimes(2);

    open?.(opened);
    await vi.advanceTimersByTimeAsync(399);
    expect(collection.set).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
    expect(collection.set).toHaveBeenCalledTimes(3);

    enabled = false;
    configuration?.({
      affectsConfiguration: (section) =>
        section === 'cisco-config-highlight.diagnostics',
    });
    expect(collection.clear).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(400);
    expect(collection.set).toHaveBeenCalledTimes(3);

    enabled = true;
    configuration?.({ affectsConfiguration: () => true });
    await vi.advanceTimersByTimeAsync(399);
    expect(collection.set).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(collection.set).toHaveBeenCalledTimes(5);
  });

  it('full-scans every document regardless of its UTF-8 size', async () => {
    const exact = makeDocument(['abc'], 'file:///exact.cisco');
    const plusOne = makeDocument(['abcd'], 'file:///plus-one.cisco');
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      exact,
      plusOne,
    ] as never);
    vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([]);
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

    registerDiagnostics({ subscriptions: [] } as never);
    await vi.advanceTimersByTimeAsync(400);

    expect(exact.lineAt).toHaveBeenCalledOnce();
    expect(collection.set).toHaveBeenCalledWith(exact.uri, []);
    expect(plusOne.lineAt).toHaveBeenCalledOnce();
    expect(collection.set).toHaveBeenCalledWith(plusOne.uri, []);
  });

  it('publishes complete findings and does not subscribe to scrolling', async () => {
    const lines = Array.from({ length: 500 }, () => '');
    lines[10] = 'ip address 999.0.0.1 255.255.255.0';
    lines[490] = 'ip address 999.0.0.2 255.255.255.0';
    const document = makeDocument(lines);
    const editor = {
      document,
      visibleRanges: [new vscode.Range(0, 0, 0, 0)],
    };
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      document,
    ] as never);
    vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockImplementation(
      () => [editor] as never,
    );
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
    const visibleListener = vi.spyOn(
      vscode.window,
      'onDidChangeTextEditorVisibleRanges',
    );

    registerDiagnostics({ subscriptions: [] } as never);
    await vi.advanceTimersByTimeAsync(400);
    await vi.runAllTimersAsync();
    expect(
      collection.set.mock.calls[0][1].map(
        (diagnostic: { range: { start: { line: number } } }) =>
          diagnostic.range.start.line,
      ),
    ).toEqual([10, 490]);
    expect(visibleListener).not.toHaveBeenCalled();
  });

  it('cancels a reentrantly stale in-flight generation before publishing', async () => {
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
    await vi.advanceTimersByTimeAsync(400);
    expect(collection.set).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(collection.set).toHaveBeenCalledOnce();
  });

  it('clears failed diagnostics and logs asynchronous scan errors', async () => {
    const document = makeDocument(['ordinary']);
    document.lineAt.mockImplementation(() => {
      throw new Error('read failed');
    });
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
    const appendLine = vi.spyOn(outputChannel, 'appendLine');

    registerDiagnostics({ subscriptions: [] } as never);
    await vi.advanceTimersByTimeAsync(400);
    await vi.runAllTimersAsync();

    expect(collection.set).not.toHaveBeenCalled();
    expect(collection.delete).toHaveBeenCalledWith(document.uri);
    expect(appendLine).toHaveBeenCalledWith(
      expect.stringContaining('Diagnostics failed for file:///config.cisco'),
    );
  });

  it('ignores non-Cisco listener events and disposes collection, listeners, and pending work', async () => {
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
    const context = { subscriptions: [] as { dispose(): void }[] };

    registerDiagnostics(context as never);
    open?.(plain as never);
    change?.({ document: plain });
    open?.(cisco);
    for (const subscription of context.subscriptions) subscription.dispose();
    await vi.advanceTimersByTimeAsync(400);

    expect(plain.getText).not.toHaveBeenCalled();
    expect(cisco.getText).not.toHaveBeenCalled();
    expect(collection.set).not.toHaveBeenCalled();
    expect(collection.dispose).toHaveBeenCalledOnce();
    expect(listenerDisposals).toHaveLength(4);
    for (const dispose of listenerDisposals)
      expect(dispose).toHaveBeenCalledOnce();
  });
});
