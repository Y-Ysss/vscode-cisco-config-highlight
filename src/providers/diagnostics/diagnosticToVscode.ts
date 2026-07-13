import * as vscode from 'vscode';
import type { RuleFinding } from './rules/ruleFinding';

export const DIAGNOSTIC_SOURCE = 'cisco-config-highlight';

export const diagnosticToVscode = (finding: RuleFinding): vscode.Diagnostic => {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(finding.line, finding.start, finding.line, finding.end),
    finding.message,
    finding.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.code = finding.code;
  diagnostic.source = DIAGNOSTIC_SOURCE;
  return diagnostic;
};
