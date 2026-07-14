import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { performance } from 'node:perf_hooks';
import { bench, describe, expect } from 'vitest';
import {
  type EnabledOutlineCategories,
  extractOutlineSymbols,
  type LineSource,
} from './outlineExtractor';

const TEN_MIB = 10 * 1024 * 1024;
const MEASURED_ITERATIONS = 20;
const WARMUP_ITERATIONS = 3;
const DEFAULT_P95_LIMIT_MS = 1_000;
const requestedP95Limit = Number(process.env.OUTLINE_BENCH_P95_LIMIT_MS);
const p95LimitMs =
  Number.isFinite(requestedP95Limit) && requestedP95Limit > 0
    ? Math.min(requestedP95Limit, DEFAULT_P95_LIMIT_MS)
    : DEFAULT_P95_LIMIT_MS;

const enabledCategories: EnabledOutlineCategories = {
  command: true,
  ip_vrf: true,
  router_bgp: true,
  address_family: true,
  class_map: true,
  policy_map: true,
  interface: true,
  sub_interface: true,
  route_map: true,
  ip_prefix_list: true,
};

const representativeBlock = [
  'version 17.9',
  'service timestamps debug datetime msec',
  'hostname edge-router-01',
  'logging buffered 1048576 informational',
  'aaa new-model',
  'clock timezone JST 9 0',
  'ip domain name example.internal',
  'ipv6 unicast-routing',
  'spanning-tree mode rapid-pvst',
  'ip vrf MGMT',
  ' rd 65000:10',
  ' route-target export 65000:10',
  ' route-target import 65000:10',
  'router bgp 65000',
  ' bgp router-id 192.0.2.1',
  ' neighbor 192.0.2.2 remote-as 65001',
  ' address-family ipv4 unicast',
  '  network 198.51.100.0 mask 255.255.255.0',
  '  neighbor 192.0.2.2 activate',
  ' address-family vpnv4 unicast',
  '  neighbor 192.0.2.2 send-community extended',
  'class-map match-any REALTIME',
  ' match dscp ef',
  ' match dscp cs5',
  'policy-map WAN-EDGE',
  ' class REALTIME',
  '  priority percent 20',
  ' class class-default',
  '  fair-queue',
  'route-map EXPORT permit 10',
  ' match ip address prefix-list EXPORTED',
  ' set metric 50',
  'ip prefix-list EXPORTED seq 10 permit 198.51.100.0/24',
  'interface GigabitEthernet0/0',
  ' description WAN uplink to provider',
  ' ip address 192.0.2.1 255.255.255.252',
  ' no shutdown',
  'interface GigabitEthernet0/0.100',
  ' encapsulation dot1q 100',
  ' ip vrf forwarding MGMT',
  ' ip address 203.0.113.1 255.255.255.0',
  'edge-router-01#show running-config',
  'Building configuration...',
  'Current configuration : 10485760 bytes',
  'interface Loopback0',
  ' description ROUTER-ID',
  ' ip address 192.0.2.1 255.255.255.255',
  'end',
  'edge-router-01#show ip interface brief',
  'Interface              IP-Address      OK? Method Status                Protocol',
  'GigabitEthernet0/0     192.0.2.1       YES NVRAM  up                    up',
  'GigabitEthernet0/1     unassigned      YES unset  administratively down down',
  'Loopback0              192.0.2.1       YES NVRAM  up                    up',
  'ordinary operational output that should take the early skip path',
  '000123: Jul 13 09:00:00.000 JST: %LINK-3-UPDOWN: Interface changed state to up',
  '!',
  '',
].join('\n');

interface BenchmarkInput {
  bytes: number;
  label: string;
  source: LineSource;
  timings: number[];
}

const toInput = (label: string, text: string): BenchmarkInput => {
  const lines = text.split(/\r?\n/);
  return {
    bytes: Buffer.byteLength(text),
    label,
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

// Fixture construction and optional file I/O happen at module initialization,
// before Vitest invokes any timed benchmark function.
const inputs: BenchmarkInput[] = [
  toInput(
    'self-contained 10 MiB fixture',
    representativeBlock.repeat(fixtureRepeats),
  ),
];

const localSamplePath = process.env.OUTLINE_BENCH_FILE;
if (localSamplePath) {
  inputs.push(
    toInput(
      `local sample (${basename(localSamplePath)})`,
      readFileSync(localSamplePath, 'utf8'),
    ),
  );
}

const percentile = (values: number[], fraction: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
};

describe('extractOutlineSymbols throughput', () => {
  for (const input of inputs) {
    bench(
      `${input.label}: ${input.bytes} bytes, ${input.source.lineCount} lines`,
      () => {
        const start = performance.now();
        const symbols = extractOutlineSymbols(input.source, enabledCategories);
        input.timings.push(performance.now() - start);
        expect(symbols.length).toBeGreaterThan(0);

        if (input.timings.length === WARMUP_ITERATIONS + MEASURED_ITERATIONS) {
          const samples = input.timings.slice(WARMUP_ITERATIONS);
          const p95 = percentile(samples, 0.95);
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
