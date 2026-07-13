export type RuleFindingSeverity = 'error' | 'warning';

/** Pure diagnostic emitted by a rule before conversion to a VS Code type. */
export interface RuleFinding {
  readonly line: number;
  /** Inclusive, zero-based character offset. */
  readonly start: number;
  /** Exclusive, zero-based character offset. */
  readonly end: number;
  readonly code: string;
  readonly message: string;
  readonly severity: RuleFindingSeverity;
}
