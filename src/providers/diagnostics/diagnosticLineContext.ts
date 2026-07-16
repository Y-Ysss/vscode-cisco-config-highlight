import type { DiagnosticCommand } from './diagnosticCommand';
import type { RuleFinding } from './rules/ruleFinding';

export interface DiagnosticLineContext {
  readonly line: number;
  readonly command: DiagnosticCommand;
  readonly collect: boolean;
  readonly findings: RuleFinding[];
}
