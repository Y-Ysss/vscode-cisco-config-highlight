import type { LineSource } from '../../parser/lineScanUtils';
import { parseDiagnosticCommand } from './diagnosticCommand';
import type { DiagnosticLineContext } from './diagnosticLineContext';
import {
  createIpv4AclScanState,
  type Ipv4AclScanState,
  processIpv4AclCommand,
} from './rules/aclWildcardMask';
import { processIpPrefixCommand } from './rules/ipPrefix';
import {
  createIpv6ScanState,
  type Ipv6ScanState,
  processIpv6Command,
} from './rules/ipv6Prefix';
import {
  createNetworkObjectGroupScanState,
  type NetworkObjectGroupScanState,
  processNetworkObjectGroupCommand,
} from './rules/objectGroupNetwork';
import type { RuleFinding } from './rules/ruleFinding';

export interface DiagnosticsScanOptions {
  readonly allowNonContiguousMask?: boolean;
}

interface ScanState {
  readonly ipv4Acl: Ipv4AclScanState;
  readonly ipv6: Ipv6ScanState;
  readonly objectGroup: NetworkObjectGroupScanState;
}

const createScanState = (): ScanState => ({
  ipv4Acl: createIpv4AclScanState(),
  ipv6: createIpv6ScanState(),
  objectGroup: createNetworkObjectGroupScanState(),
});

const processLine = (
  state: ScanState,
  findings: RuleFinding[],
  line: number,
  text: string,
  options: DiagnosticsScanOptions,
): void => {
  const context: DiagnosticLineContext = {
    line,
    command: parseDiagnosticCommand(text),
    collect: true,
    findings,
  };

  processIpPrefixCommand(context, options);
  processIpv4AclCommand(state.ipv4Acl, context);
  processIpv6Command(state.ipv6, context);
  processNetworkObjectGroupCommand(state.objectGroup, context, options);
};

const finish = (findings: RuleFinding[]): RuleFinding[] => {
  findings.sort(
    (left, right) => left.line - right.line || left.start - right.start,
  );
  return findings;
};

export const scanDiagnosticFindings = (
  source: LineSource,
  options: DiagnosticsScanOptions = {},
  isCancelled: () => boolean = () => false,
): RuleFinding[] => {
  const state = createScanState();
  const findings: RuleFinding[] = [];
  for (let line = 0; line < source.lineCount; line += 1) {
    if ((line & 255) === 0 && isCancelled()) return [];
    processLine(state, findings, line, source.lineAt(line), options);
    if (isCancelled()) return [];
  }
  return finish(findings);
};

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

export const scanDiagnosticFindingsAsync = async (
  source: LineSource,
  options: DiagnosticsScanOptions = {},
  isCancelled: () => boolean = () => false,
): Promise<RuleFinding[] | null> => {
  const state = createScanState();
  const findings: RuleFinding[] = [];
  for (let line = 0; line < source.lineCount; line += 1) {
    if ((line & 255) === 0) {
      if (isCancelled()) return null;
      if (line > 0) await yieldToEventLoop();
      if (isCancelled()) return null;
    }
    processLine(state, findings, line, source.lineAt(line), options);
    if (isCancelled()) return null;
  }
  return finish(findings);
};
