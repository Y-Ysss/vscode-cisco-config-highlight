import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { diagnosticToVscode } from './diagnosticToVscode';

describe('diagnosticToVscode', () => {
  it.each([
    ['error', vscode.DiagnosticSeverity.Error],
    ['warning', vscode.DiagnosticSeverity.Warning],
  ] as const)('converts exact fields for %s findings', (severity, expected) => {
    const diagnostic = diagnosticToVscode({
      line: 7,
      start: 3,
      end: 11,
      code: 'stable-code',
      message: 'Exact message.',
      severity,
    });

    expect(diagnostic).toMatchObject({
      range: {
        start: { line: 7, character: 3 },
        end: { line: 7, character: 11 },
      },
      message: 'Exact message.',
      severity: expected,
      code: 'stable-code',
      source: 'cisco-config-highlight',
    });
  });
});
