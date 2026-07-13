import { describe, expect, it, vi } from 'vitest';
import type { LineSource } from '../../parser/lineScanUtils';
import {
  scanDiagnosticFindings,
  scanDiagnosticFindingsAsync,
} from './diagnosticsScanner';

describe('combined Diagnostics scanner', () => {
  it('reads the source exactly once while preserving all four rule families', () => {
    const lines = [
      'ip address 999.0.0.1 255.255.255.0',
      'ipv6 address 2001:12345::1/129',
      'access-list 10 permit 999.0.0.1 0.0.0.255',
      'object-group network INVALID',
      ' network-object host bogus',
      'ordinary nonmatching text',
    ];
    const lineAt = vi.fn((line: number) => lines[line]);

    const findings = scanDiagnosticFindings({
      lineCount: lines.length,
      lineAt,
    });

    expect(lineAt.mock.calls.map(([line]) => line)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(findings.map(({ line }) => line))).toEqual(
      new Set([0, 1, 2, 4]),
    );
  });

  it('yields to the real event loop and observes cancellation before the next 256-line chunk', async () => {
    const lineAt = vi.fn(() => 'ordinary nonmatching text');
    const source: LineSource = { lineCount: 2_000, lineAt };
    let cancelled = false;
    setImmediate(() => {
      cancelled = true;
    });

    const findings = await scanDiagnosticFindingsAsync(
      source,
      {},
      () => cancelled,
    );

    expect(findings).toBeNull();
    expect(lineAt).toHaveBeenCalledTimes(256);
  });
});
