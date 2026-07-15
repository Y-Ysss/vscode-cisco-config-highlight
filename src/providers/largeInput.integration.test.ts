import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as vscode from 'vscode';
import { scanDiagnosticFindings } from './diagnostics/diagnosticsScanner';
import { registerDiagnostics } from './diagnostics/registerDiagnostics';
import { CiscoConfigDocumentSymbolProviderForTest } from './outline/registerDocumentSymbol';

const TWENTY_MIB = 20 * 1024 * 1024;
const BLOCK_LINE_COUNT = 8_192;
const markerLines = [
  'router bgp 65000',
  ' address-family ipv4 unicast',
  'interface GigabitEthernet0/0',
  'interface GigabitEthernet0/0.100',
  'ip prefix-list EXPORTED permit 198.51.100.0/24',
  'ip address 999.0.0.1 255.255.255.0',
  'ipv6 address 2001:12345::1/129',
  'access-list 10 permit 999.0.0.1 0.0.0.255',
  'object-group network INVALID-HOST',
  ' network-object host bogus',
];
const fillerLine = 'logging buffered 1048576 informational';
const blockLines = [
  ...markerLines,
  ...Array.from(
    { length: BLOCK_LINE_COUNT - markerLines.length },
    () => fillerLine,
  ),
];
const blockText = `${blockLines.join('\n')}\n`;
const repeatCount = Math.ceil(TWENTY_MIB / Buffer.byteLength(blockText));
const scrolledDiagnosticText = 'no ip address 999.0.0.2 255.255.255.0';
const tailLine = 'interface TAIL-ONLY';
let largeText = `${blockText.repeat(repeatCount)}${scrolledDiagnosticText}\n${tailLine}`;
const largeLineCount = BLOCK_LINE_COUNT * repeatCount + 2;
const largeBytes = Buffer.byteLength(largeText);
const scrolledDiagnosticLine = largeLineCount - 2;

const textAt = (line: number): string => {
  if (line === scrolledDiagnosticLine) return scrolledDiagnosticText;
  if (line === largeLineCount - 1) return tailLine;
  return blockLines[line % BLOCK_LINE_COUNT];
};

const makeLargeDocument = (id = 'file:///large.cisco') => {
  const lineAt = vi.fn((line: number) => ({ text: textAt(line) }));
  return {
    languageId: 'cisco',
    lineCount: largeLineCount,
    uri: { toString: () => id },
    getText: vi.fn(() => largeText),
    lineAt,
  };
};

const source = {
  lineCount: largeLineCount,
  lineAt: textAt,
};

const diagnosticCollection = () => ({
  set: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  dispose: vi.fn(),
});

describe('20 MiB Outline and Diagnostics integration', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('full-scans Outline hierarchy and includes declarations through the tail', () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) => {
        if (key === 'outline.showSymbolsInOutlinePanel') return true;
        if (key === 'outline.maxFileSizeForFullScan') return largeBytes;
        return fallback;
      },
    } as never);

    const symbols =
      new CiscoConfigDocumentSymbolProviderForTest().provideDocumentSymbols(
        makeLargeDocument() as never,
        { isCancellationRequested: false } as never,
      );

    expect(largeBytes).toBeGreaterThanOrEqual(TWENTY_MIB);
    expect(symbols.at(-1)?.name).not.toBe(
      'Truncated output (see settings for max output size)',
    );
    expect(
      symbols
        .flatMap(({ children }) => children)
        .some(({ name }) => name === tailLine.slice('interface '.length)),
    ).toBe(true);
    const routerCategory = symbols.find(({ name }) => name === 'router bgp');
    expect(routerCategory?.children[0]?.children[0]).toMatchObject({
      name: 'ipv4 unicast',
    });
  }, 30_000);

  it('prefix-scans large Outline input, adds one exact truncation symbol, and never notifies', () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) => {
        if (key === 'outline.showSymbolsInOutlinePanel') return true;
        if (key === 'outline.maxFileSizeForFullScan') return 512 * 1024;
        return fallback;
      },
    } as never);
    const notification = vi.spyOn(vscode.window, 'showInformationMessage');
    const warning = vi.spyOn(vscode.window, 'showWarningMessage');
    const document = makeLargeDocument();

    const symbols =
      new CiscoConfigDocumentSymbolProviderForTest().provideDocumentSymbols(
        document as never,
        { isCancellationRequested: false } as never,
      );

    const truncations = symbols.filter(
      ({ name }) =>
        name === 'Truncated output (see settings for max output size)',
    );
    expect(truncations).toHaveLength(1);
    expect(truncations[0]).toMatchObject({
      name: 'Truncated output (see settings for max output size)',
      detail: '',
      kind: vscode.SymbolKind.String,
    });
    expect(document.lineAt.mock.calls.length).toBeLessThan(largeLineCount);
    expect(
      symbols
        .flatMap(({ children }) => children)
        .some(({ name }) => name === 'TAIL-ONLY'),
    ).toBe(false);
    expect(notification).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('returns no Outline symbols or pseudo-symbol when cancellation interrupts a large scan', () => {
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) => {
        if (key === 'outline.showSymbolsInOutlinePanel') return true;
        if (key === 'outline.maxFileSizeForFullScan') return 512 * 1024;
        return fallback;
      },
    } as never);
    const notification = vi.spyOn(vscode.window, 'showInformationMessage');
    const warning = vi.spyOn(vscode.window, 'showWarningMessage');
    let cancellationChecks = 0;

    const symbols =
      new CiscoConfigDocumentSymbolProviderForTest().provideDocumentSymbols(
        makeLargeDocument() as never,
        {
          get isCancellationRequested() {
            cancellationChecks += 1;
            return cancellationChecks === 4;
          },
        } as never,
      );

    expect(symbols).toEqual([]);
    expect(cancellationChecks).toBe(5);
    expect(notification).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('full-scans all four Diagnostics rule families through the public pure entry point', () => {
    const findings = scanDiagnosticFindings(source);
    const firstBlockCodes = new Set(
      findings
        .filter(({ line }) => line < markerLines.length)
        .map(({ code }) => code),
    );

    expect(largeBytes).toBeGreaterThanOrEqual(TWENTY_MIB);
    expect(firstBlockCodes).toEqual(
      new Set(['invalid-ipv4', 'invalid-ipv6', 'invalid-prefix-length']),
    );
    for (const ruleFamilyLine of [5, 6, 7, 9]) {
      expect(findings.some(({ line }) => line === ruleFamilyLine)).toBe(true);
    }
  }, 30_000);

  it('merges visible buffers, replaces scrolled Diagnostics after 400 ms, and excludes off-range values', async () => {
    vi.useFakeTimers();
    const document = makeLargeDocument();
    let visibleRanges = [new vscode.Range(0, 0, 0, 0)];
    let secondVisibleRanges = [new vscode.Range(401, 0, 401, 0)];
    const editor = {
      document,
      get visibleRanges() {
        return visibleRanges;
      },
    };
    const secondEditor = {
      document,
      get visibleRanges() {
        return secondVisibleRanges;
      },
    };
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      document,
    ] as never);
    vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockImplementation(
      () => [editor, secondEditor] as never,
    );
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) =>
        key === 'diagnostics.maxFileSizeForFullScan' ? 1 : fallback,
    } as never);
    const collection = diagnosticCollection();
    vi.spyOn(vscode.languages, 'createDiagnosticCollection').mockReturnValue(
      collection as never,
    );
    const notification = vi.spyOn(vscode.window, 'showInformationMessage');
    const warning = vi.spyOn(vscode.window, 'showWarningMessage');
    let visible: ((event: { textEditor: typeof editor }) => void) | undefined;
    vi.spyOn(
      vscode.window,
      'onDidChangeTextEditorVisibleRanges',
    ).mockImplementation(((listener: typeof visible) => {
      visible = listener;
      return { dispose: vi.fn() };
    }) as never);

    registerDiagnostics({ subscriptions: [] } as never);
    await vi.advanceTimersByTimeAsync(400);
    await vi.runAllTimersAsync();
    const initialLines = collection.set.mock.calls[0][1].map(
      (diagnostic: vscode.Diagnostic) => diagnostic.range.start.line,
    );
    expect(initialLines.length).toBeGreaterThanOrEqual(4);
    expect(initialLines).toContain(5);
    expect(initialLines).not.toContain(BLOCK_LINE_COUNT + 5);
    expect(initialLines).not.toContain(scrolledDiagnosticLine);
    expect(initialLines.every((line: number) => line <= 601)).toBe(true);
    expect(document.lineAt).toHaveBeenCalledTimes(largeLineCount);
    expect(document.lineAt.mock.calls[0][0]).toBe(0);
    expect(document.lineAt.mock.calls.at(-1)?.[0]).toBe(largeLineCount - 1);

    document.lineAt.mockClear();
    visibleRanges = [
      new vscode.Range(largeLineCount - 1, 0, largeLineCount - 1, 0),
    ];
    secondVisibleRanges = visibleRanges;
    visible?.({ textEditor: editor });
    await vi.advanceTimersByTimeAsync(399);
    expect(collection.set).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
    expect(collection.set).toHaveBeenCalledTimes(2);
    const replacementLines = collection.set.mock.calls[1][1].map(
      (diagnostic: vscode.Diagnostic) => diagnostic.range.start.line,
    );
    expect(
      replacementLines.every((line: number) => line >= largeLineCount - 201),
    ).toBe(true);
    expect(replacementLines).toEqual([scrolledDiagnosticLine]);
    expect(replacementLines).not.toContain(5);
    expect(replacementLines).not.toContain(BLOCK_LINE_COUNT + 5);
    expect(notification).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('cancels a large Diagnostics generation on a new edit and never publishes stale partial results', async () => {
    vi.useFakeTimers();
    const document = makeLargeDocument();
    const editor = {
      document,
      visibleRanges: [new vscode.Range(0, 0, 0, 0)],
    };
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      document,
    ] as never);
    vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([
      editor,
    ] as never);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) =>
        key === 'diagnostics.maxFileSizeForFullScan' ? 1 : fallback,
    } as never);
    const collection = diagnosticCollection();
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
      return { text: textAt(line) };
    });

    registerDiagnostics({ subscriptions: [] } as never);
    await vi.advanceTimersByTimeAsync(400);
    expect(collection.set).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(collection.set).toHaveBeenCalledOnce();
  });

  it('retains distant ACL and object-group context but publishes only visible buffered findings', async () => {
    vi.useFakeTimers();
    const lines = Array.from({ length: 2_700 }, () => 'ordinary');
    lines[0] = 'ip access-list standard FAR-V4';
    for (let line = 1; line < 250; line += 1) lines[line] = ' remark context';
    lines[250] = ' permit host 999.0.0.1';
    lines[700] = 'access-list 10 permit 999.0.0.7 0.0.0.255';
    lines[1_000] = 'ipv6 access-list FAR-V6';
    for (let line = 1_001; line < 1_250; line += 1) lines[line] = '';
    lines[1_250] = ' permit ipv6 host 2001:12345::1 any';
    lines[2_000] = 'object-group network FAR-OBJECT';
    for (let line = 2_001; line < 2_250; line += 1) {
      lines[line] = ' description context';
    }
    lines[2_250] = ' network-object host bogus';
    const lineAt = vi.fn((line: number) => ({ text: lines[line] }));
    const document = {
      languageId: 'cisco',
      lineCount: lines.length,
      uri: { toString: () => 'file:///state-context.cisco' },
      getText: vi.fn(() => lines.join('\n')),
      lineAt,
    };
    const editors = [450, 1_450, 2_450].map((line) => ({
      document,
      visibleRanges: [new vscode.Range(line, 0, line, 0)],
    }));
    vi.spyOn(vscode.workspace, 'textDocuments', 'get').mockReturnValue([
      document,
    ] as never);
    vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue(
      editors as never,
    );
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, fallback: unknown) =>
        key === 'diagnostics.maxFileSizeForFullScan' ? 1 : fallback,
    } as never);
    const collection = diagnosticCollection();
    vi.spyOn(vscode.languages, 'createDiagnosticCollection').mockReturnValue(
      collection as never,
    );
    const notification = vi.spyOn(vscode.window, 'showInformationMessage');

    registerDiagnostics({ subscriptions: [] } as never);
    await vi.advanceTimersByTimeAsync(400);
    await vi.runAllTimersAsync();

    const findingLines = collection.set.mock.calls[0][1].map(
      (diagnostic: vscode.Diagnostic) => diagnostic.range.start.line,
    );
    expect(findingLines).toEqual([250, 1_250, 2_250]);
    expect(findingLines).not.toContain(700);
    expect(lineAt).toHaveBeenCalledTimes(lines.length);
    expect(notification).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  // Drop the module-owned 20 MiB reference after this worker finishes the file.
  largeText = '';
});
