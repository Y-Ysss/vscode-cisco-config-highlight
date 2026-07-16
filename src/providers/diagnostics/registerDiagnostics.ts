import * as vscode from 'vscode';
import { outputChannel } from '../../channel';
import {
  getConfigDiagnosticsAllowNonContiguousMask,
  getConfigDiagnosticsEnabled,
  getConfigDiagnosticsMaxFileSize,
} from '../../config';
import { EXTENSION_ID } from '../../contributions/configurations';
import type { LineSource } from '../../parser/lineScanUtils';
import { scanDiagnosticFindingsAsync } from './diagnosticsScanner';
import { diagnosticToVscode } from './diagnosticToVscode';

const DEBOUNCE_MILLISECONDS = 400;

interface UriWork {
  generation: number;
  timer?: ReturnType<typeof setTimeout>;
  tokenSource?: vscode.CancellationTokenSource;
  byteSize?: {
    readonly version: number;
    readonly value: number;
  };
  skipLogged?: boolean;
}

const uriKey = (document: vscode.TextDocument): string =>
  document.uri.toString();

const isCiscoDocument = (document: vscode.TextDocument): boolean =>
  document.languageId === 'cisco';

const utf8ByteSize = (document: vscode.TextDocument): number =>
  Buffer.byteLength(document.getText(), 'utf8');

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
      work.generation !== generation;

    try {
      const byteSize =
        work.byteSize?.version === document.version
          ? work.byteSize.value
          : utf8ByteSize(document);
      work.byteSize = { version: document.version, value: byteSize };
      const maxFileSize = getConfigDiagnosticsMaxFileSize();
      if (stale()) return;
      if (byteSize > maxFileSize) {
        collection.delete(document.uri);
        if (!work.skipLogged) {
          outputChannel.appendLine(
            `Diagnostics skipped for ${document.uri.toString()}: ${byteSize} UTF-8 bytes exceeds the configured maximum of ${maxFileSize} bytes.`,
          );
          work.skipLogged = true;
        }
        return;
      }
      work.skipLogged = false;
      const source: LineSource = {
        lineCount: document.lineCount,
        lineAt: (line) => document.lineAt(line).text,
      };
      const findings = await scanDiagnosticFindingsAsync(
        source,
        {
          allowNonContiguousMask: getConfigDiagnosticsAllowNonContiguousMask(),
        },
        stale,
      );
      if (findings === null || stale()) return;
      collection.set(document.uri, findings.map(diagnosticToVscode));
    } catch (error) {
      if (!stale()) {
        collection.delete(document.uri);
        outputChannel.appendLine(
          `Diagnostics failed for ${document.uri.toString()}: ${String(error)}`,
        );
      }
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
    cleanup,
  );
  for (const document of vscode.workspace.textDocuments) schedule(document);
};
