// vscode module mock — used via Vitest alias resolution

export const SymbolKind = {
  File: 0,
  Module: 1,
  Namespace: 2,
  Package: 3,
  Class: 4,
  Method: 5,
  Property: 6,
  Field: 7,
  Constructor: 8,
  Enum: 9,
  Interface: 10,
  Function: 11,
  Variable: 12,
  Constant: 13,
  String: 14,
  Number: 15,
  Boolean: 16,
  Array: 17,
  Object: 18,
  Key: 19,
  Null: 20,
  EnumMember: 21,
  Struct: 22,
  Event: 23,
  Operator: 24,
  TypeParameter: 25,
};

export class DocumentSymbol {
  children: DocumentSymbol[] = [];
  constructor(
    public name: string,
    public detail: string,
    public kind: number,
    public range: unknown,
    public selectionRange: unknown,
  ) {}
}

export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

export class Range {
  public start: Position;
  public end: Position;

  constructor(
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
  ) {
    this.start = new Position(startLine, startCharacter);
    this.end = new Position(endLine, endCharacter);
  }
}

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
};

export class Diagnostic {
  public source?: string;
  public code?: string | number;

  constructor(
    public range: Range,
    public message: string,
    public severity: number,
  ) {}
}

export class CancellationTokenSource {
  private cancelled = false;
  public readonly token = {
    get isCancellationRequested() {
      return false;
    },
  };

  constructor() {
    const owner = this;
    this.token = {
      get isCancellationRequested() {
        return owner.cancelled;
      },
    };
  }

  cancel(): void {
    this.cancelled = true;
  }

  dispose(): void {}
}

export const workspace = {
  textDocuments: [] as unknown[],
  getConfiguration: (_section?: string) => ({
    get: (_key: string, defaultValue: unknown) => defaultValue,
  }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
  onDidOpenTextDocument: () => ({ dispose: () => {} }),
  onDidChangeTextDocument: () => ({ dispose: () => {} }),
  onDidCloseTextDocument: () => ({ dispose: () => {} }),
};

export const languages = {
  registerDocumentSymbolProvider: () => ({ dispose: () => {} }),
  createDiagnosticCollection: () => ({
    set: (_uri: unknown, _diagnostics: unknown[]) => {},
    delete: (_uri: unknown) => {},
    clear: () => {},
    dispose: () => {},
  }),
};

export const window = {
  visibleTextEditors: [] as unknown[],
  onDidChangeTextEditorVisibleRanges: () => ({ dispose: () => {} }),
  showInformationMessage: (..._args: unknown[]) => Promise.resolve(undefined),
  showWarningMessage: (..._args: unknown[]) => Promise.resolve(undefined),
  createOutputChannel: (_name: string) => ({
    appendLine: (_value: string) => {},
    append: (_value: string) => {},
    show: () => {},
    dispose: () => {},
  }),
};
