import assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'Y-Ysss.cisco-config-highlight';
const CONFIGURATION_SECTION = 'cisco-config-highlight';
const OUTLINE_ENABLED = 'outline.showSymbolsInOutlinePanel';

const delay = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

const waitForDiagnostics = async (
  uri: vscode.Uri,
  code: string,
  timeoutMilliseconds = 5000,
): Promise<readonly vscode.Diagnostic[]> => {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.some((diagnostic) => diagnostic.code === code)) {
      return diagnostics;
    }
    await delay(50);
  }

  return vscode.languages.getDiagnostics(uri);
};

const collectSymbolNames = (
  symbols: readonly vscode.DocumentSymbol[],
): string[] =>
  symbols.flatMap((symbol) => [
    symbol.name,
    ...collectSymbolNames(symbol.children),
  ]);

suite('Cisco Config Highlight Extension Host', () => {
  let extension: vscode.Extension<unknown>;

  suiteSetup(async () => {
    const installedExtension =
      vscode.extensions.getExtension<unknown>(EXTENSION_ID);
    assert.ok(installedExtension, `${EXTENSION_ID} is not installed`);
    extension = installedExtension;
    await extension.activate();
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('activates and opens Cisco documents with the contributed language', async () => {
    const fixtureUri = vscode.Uri.joinPath(
      extension.extensionUri,
      'test',
      'fixtures',
      'sample.cisco',
    );
    const document = await vscode.workspace.openTextDocument(fixtureUri);
    await vscode.window.showTextDocument(document);

    assert.equal(extension.isActive, true);
    assert.equal(document.languageId, 'cisco');
  });

  test('publishes diagnostics through the real VS Code API', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'cisco',
      content: 'ip address 999.0.0.1 255.255.255.0',
    });
    await vscode.window.showTextDocument(document);

    const diagnostics = await waitForDiagnostics(document.uri, 'invalid-ipv4');

    assert.ok(
      diagnostics.some((diagnostic) => diagnostic.code === 'invalid-ipv4'),
      `Expected invalid-ipv4 diagnostic, received: ${diagnostics
        .map((diagnostic) => String(diagnostic.code))
        .join(', ')}`,
    );
  });

  test('provides document symbols through the registered provider', async () => {
    const configuration = vscode.workspace.getConfiguration(
      CONFIGURATION_SECTION,
    );
    const previousValue =
      configuration.inspect<boolean>(OUTLINE_ENABLED)?.globalValue;

    try {
      await configuration.update(
        OUTLINE_ENABLED,
        true,
        vscode.ConfigurationTarget.Global,
      );
      const document = await vscode.workspace.openTextDocument({
        language: 'cisco',
        content: 'interface GigabitEthernet0/1\n description integration test',
      });
      await vscode.window.showTextDocument(document);

      const symbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[]
      >('vscode.executeDocumentSymbolProvider', document.uri);

      assert.ok(symbols, 'Document symbol provider returned no result');
      assert.ok(
        collectSymbolNames(symbols).includes('GigabitEthernet0/1'),
        `Expected interface symbol, received: ${collectSymbolNames(
          symbols,
        ).join(', ')}`,
      );
    } finally {
      await configuration.update(
        OUTLINE_ENABLED,
        previousValue,
        vscode.ConfigurationTarget.Global,
      );
    }
  });
});
