import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { performance } from 'node:perf_hooks';
import { bench, describe, expect } from 'vitest';
import type { LineSource } from '../../parser/lineScanUtils';
import { scanDiagnosticFindings } from './diagnosticsScanner';

const TEN_MIB = 10 * 1024 * 1024;
const MEASURED_ITERATIONS = 20;
const WARMUP_ITERATIONS = 3;
const DEFAULT_P95_LIMIT_MS = 1_000;
const requestedP95Limit = Number(process.env.DIAGNOSTICS_BENCH_P95_LIMIT_MS);
const p95LimitMs =
  Number.isFinite(requestedP95Limit) && requestedP95Limit > 0
    ? Math.min(requestedP95Limit, DEFAULT_P95_LIMIT_MS)
    : DEFAULT_P95_LIMIT_MS;

const representativeBlock = [
  'version 17.9',
  'service timestamps debug datetime msec',
  'hostname edge-router-01',
  'logging buffered 1048576 informational',
  'aaa new-model',
  'clock timezone JST 9 0',
  'ip domain name example.internal',
  'spanning-tree mode rapid-pvst',
  'ip address 999.0.0.1 255.255.255.0',
  'ipv6 address 2001:12345::1/129',
  'access-list 10 permit 999.0.0.1 0.0.0.255',
  'object-group network INVALID-HOST',
  ' network-object host bogus',
  'ordinary operational output that should take the early skip path',
  '000123: Jul 13 09:00:00.000 JST: %LINK-3-UPDOWN: Interface changed state to up',
  '!',
  '',
].join('\n');

interface BenchmarkInput {
  readonly bytes: number;
  readonly label: string;
  readonly minimumFindings: number;
  readonly source: LineSource;
  readonly timings: number[];
}

const toInput = (
  label: string,
  text: string,
  minimumFindings = 0,
): BenchmarkInput => {
  const lines = text.split(/\r?\n/);
  return {
    bytes: Buffer.byteLength(text),
    label,
    minimumFindings,
    source: {
      lineCount: lines.length,
      lineAt: (index) => lines[index],
    },
    timings: [],
  };
};

const fixtureRepeats = Math.ceil(
  TEN_MIB / Buffer.byteLength(representativeBlock),
);
const selfContainedFixture = representativeBlock
  .repeat(fixtureRepeats)
  .slice(0, TEN_MIB);

// Fixture generation and optional file I/O stay outside timed callbacks.
const inputs: BenchmarkInput[] = [
  toInput('self-contained 10 MiB fixture', selfContainedFixture, 4),
];

const localSamplePath = process.env.DIAGNOSTICS_BENCH_FILE;
if (localSamplePath) {
  inputs.push(
    toInput(
      `local sample (${basename(localSamplePath)})`,
      readFileSync(localSamplePath, 'utf8'),
    ),
  );
}

const nearestRankP95 = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
};

describe('complete diagnostics throughput', () => {
  expect(inputs[0].bytes).toBe(TEN_MIB);
  for (const input of inputs) {
    bench(
      `${input.label}: ${input.bytes} bytes, ${input.source.lineCount} lines`,
      () => {
        const start = performance.now();
        const findings = scanDiagnosticFindings(input.source);
        input.timings.push(performance.now() - start);
        expect(findings.length).toBeGreaterThanOrEqual(input.minimumFindings);

        if (input.timings.length === WARMUP_ITERATIONS + MEASURED_ITERATIONS) {
          const samples = input.timings.slice(WARMUP_ITERATIONS);
          const p95 = nearestRankP95(samples);
          process.stdout.write(
            `\nDIAGNOSTICS_BENCH ${input.label} samples_ms=${samples
              .map((sample) => sample.toFixed(2))
              .join(',')} p95_ms=${p95.toFixed(2)} limit_ms=${p95LimitMs}\n`,
          );
          expect(samples).toHaveLength(MEASURED_ITERATIONS);
          expect(p95).toBeLessThan(p95LimitMs);
        }
      },
      {
        iterations: MEASURED_ITERATIONS,
        time: 0,
        warmupIterations: WARMUP_ITERATIONS,
        warmupTime: 0,
      },
    );
  }
});
