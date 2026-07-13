import * as vscode from 'vscode';
import {
  getConfigDiagnosticsAllowNonContiguousMask,
  getConfigDiagnosticsEnabled,
  getConfigDiagnosticsMaxFileSizeForFullScan,
} from '../../config';
import { EXTENSION_ID } from '../../contributions/configurations';
import type { LineSource } from '../../parser/lineScanUtils';
import {
  scanDiagnosticFindings,
  scanDiagnosticFindingsAsync,
} from './diagnosticsScanner';
import { diagnosticToVscode } from './diagnosticToVscode';
import type { RuleFinding } from './rules/ruleFinding';

const DEBOUNCE_MILLISECONDS = 400;
const VISIBLE_RANGE_BUFFER_LINES = 200;

interface LineRange {
  readonly start: number;
  readonly end: number;
}

interface UriWork {
  generation: number;
  timer?: ReturnType<typeof setTimeout>;
  tokenSource?: vscode.CancellationTokenSource;
}

const uriKey = (document: vscode.TextDocument): string =>
  document.uri.toString();

const isCiscoDocument = (document: vscode.TextDocument): boolean =>
  document.languageId === 'cisco';

const utf8ByteSize = (document: vscode.TextDocument): number =>
  Buffer.byteLength(document.getText(), 'utf8');

const visibleLineRanges = (document: vscode.TextDocument): LineRange[] => {
  if (document.lineCount === 0) return [];
  const ranges = vscode.window.visibleTextEditors
    .filter((editor) => uriKey(editor.document) === uriKey(document))
    .flatMap((editor) => editor.visibleRanges)
    .map((range) => ({
      start: Math.max(0, range.start.line - VISIBLE_RANGE_BUFFER_LINES),
      end: Math.min(
        document.lineCount - 1,
        range.end.line + VISIBLE_RANGE_BUFFER_LINES,
      ),
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: LineRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end + 1) {
      merged.push(range);
    } else if (range.end > previous.end) {
      merged[merged.length - 1] = { start: previous.start, end: range.end };
    }
  }
  return merged;
};

const fullDocumentRange = (document: vscode.TextDocument): LineRange[] =>
  document.lineCount === 0 ? [] : [{ start: 0, end: document.lineCount - 1 }];

const snapshotRanges = (
  document: vscode.TextDocument,
  ranges: readonly LineRange[],
  isCancelled: () => boolean,
): ReadonlyArray<{
  readonly start: number;
  readonly lines: readonly string[];
}> | null => {
  const snapshots: Array<{ start: number; lines: string[] }> = [];
  let linesRead = 0;
  for (const range of ranges) {
    const lines: string[] = [];
    for (let line = range.start; line <= range.end; line += 1) {
      if ((linesRead & 255) === 0 && isCancelled()) return null;
      lines.push(document.lineAt(line).text);
      linesRead += 1;
    }
    snapshots.push({ start: range.start, lines });
  }
  return snapshots;
};

const offsetFindings = (
  findings: readonly RuleFinding[],
  lineOffset: number,
): RuleFinding[] =>
  findings.map((finding) => ({ ...finding, line: finding.line + lineOffset }));

const scanSnapshots = (
  snapshots: ReadonlyArray<{
    readonly start: number;
    readonly lines: readonly string[];
  }>,
  allowNonContiguousMask: boolean,
  isCancelled: () => boolean,
): RuleFinding[] | null => {
  const findings: RuleFinding[] = [];
  for (const snapshot of snapshots) {
    const source: LineSource = {
      lineCount: snapshot.lines.length,
      lineAt: (line) => snapshot.lines[line],
    };
    findings.push(
      ...offsetFindings(
        scanDiagnosticFindings(source, { allowNonContiguousMask }, isCancelled),
        snapshot.start,
      ),
    );
    if (isCancelled()) return null;
  }
  findings.sort((left, right) => left.line - right.line);
  return findings;
};

export const registerDiagnostics = (context: vscode.ExtensionContext): void => {
  const collection = vscode.languages.createDiagnosticCollection(EXTENSION_ID);
  const workByUri = new Map<string, UriWork>();
  let disposed = false;

  const invalidate = (document: vscode.TextDocument): UriWork => {
    const key = uriKey(document);
    const work = workByUri.get(key) ?? { generation: 0 };
    work.generation += 1;
    if (work.timer !== undefined) clearTimeout(work.timer);
    work.timer = undefined;
    work.tokenSource?.cancel();
    work.tokenSource?.dispose();
    work.tokenSource = undefined;
    workByUri.set(key, work);
    return work;
  };

  const run = async (
    document: vscode.TextDocument,
    work: UriWork,
    generation: number,
  ): Promise<void> => {
    if (disposed || !getConfigDiagnosticsEnabled()) return;
    const tokenSource = new vscode.CancellationTokenSource();
    work.tokenSource = tokenSource;
    const stale = () =>
      disposed ||
      tokenSource.token.isCancellationRequested ||
      work.generation !== generation ||
      !getConfigDiagnosticsEnabled();

    try {
      const threshold = getConfigDiagnosticsMaxFileSizeForFullScan();
      const isLarge = utf8ByteSize(document) > threshold;
      const ranges = isLarge
        ? visibleLineRanges(document)
        : fullDocumentRange(document);
      if (stale()) return;
      if (isLarge && ranges.length === 0) {
        collection.delete(document.uri);
        return;
      }
      const source: LineSource = {
        lineCount: document.lineCount,
        lineAt: (line) => document.lineAt(line).text,
      };
      const findings = await scanDiagnosticFindingsAsync(
        source,
        {
          allowNonContiguousMask: getConfigDiagnosticsAllowNonContiguousMask(),
          includedRanges: isLarge ? ranges : undefined,
        },
        stale,
      );
      if (findings === null || stale()) return;
      collection.set(document.uri, findings.map(diagnosticToVscode));
    } finally {
      if (work.generation === generation && work.tokenSource === tokenSource) {
        work.tokenSource = undefined;
        tokenSource.dispose();
      }
    }
  };

  const schedule = (document: vscode.TextDocument): void => {
    if (!isCiscoDocument(document)) return;
    const work = invalidate(document);
    if (!getConfigDiagnosticsEnabled()) {
      collection.delete(document.uri);
      return;
    }
    const generation = work.generation;
    work.timer = setTimeout(() => {
      if (work.generation !== generation || disposed) return;
      work.timer = undefined;
      void run(document, work, generation);
    }, DEBOUNCE_MILLISECONDS);
  };

  const openListener = vscode.workspace.onDidOpenTextDocument(schedule);
  const changeListener = vscode.workspace.onDidChangeTextDocument((event) =>
    schedule(event.document),
  );
  const closeListener = vscode.workspace.onDidCloseTextDocument((document) => {
    if (!isCiscoDocument(document)) return;
    invalidate(document);
    workByUri.delete(uriKey(document));
    collection.delete(document.uri);
  });
  const visibleRangesListener =
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (!isCiscoDocument(event.textEditor.document)) return;
      schedule(event.textEditor.document);
    });
  const configurationListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (!event.affectsConfiguration(`${EXTENSION_ID}.diagnostics`)) return;
      for (const document of vscode.workspace.textDocuments) {
        if (isCiscoDocument(document)) invalidate(document);
      }
      if (!getConfigDiagnosticsEnabled()) {
        collection.clear();
        return;
      }
      for (const document of vscode.workspace.textDocuments) schedule(document);
    },
  );
  const cleanup = {
    dispose: () => {
      disposed = true;
      for (const work of workByUri.values()) {
        if (work.timer !== undefined) clearTimeout(work.timer);
        work.tokenSource?.cancel();
        work.tokenSource?.dispose();
      }
      workByUri.clear();
    },
  };

  context.subscriptions.push(
    collection,
    openListener,
    changeListener,
    closeListener,
    configurationListener,
    visibleRangesListener,
    cleanup,
  );
  for (const document of vscode.workspace.textDocuments) schedule(document);
};

export const diagnosticsInternalsForTest = {
  snapshotRanges,
  scanSnapshots,
  visibleLineRanges,
  utf8ByteSize,
};
