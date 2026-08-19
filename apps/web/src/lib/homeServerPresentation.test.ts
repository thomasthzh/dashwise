import { expect, test } from "bun:test";

import {
  formatBinaryBytes,
  resolveHomeServerCardHref,
  resolveHardwarePanel,
  resolveHomeAccessStates,
  resolveOceanBackground,
  resolveTelemetryFreshness,
  shouldPlayOceanVideo,
} from "./homeServerPresentation";
import type { HomeServerSnapshot } from "./homeServerClient";

const hardwareSnapshot = {
  generatedAt: "2026-08-19T04:00:00.000Z",
  host: {
    hostname: "126f",
    uptimeSeconds: 100,
    cpuPercent: 3,
    memoryPercent: 48,
    diskPercent: 6,
    load1: 0.11,
    memoryUsedBytes: 16_123_355_136,
    memoryTotalBytes: 33_437_224_960,
    diskUsedBytes: 51_020_312_576,
    diskTotalBytes: 972_371_521_536,
  },
  hardware: {
    boardModel: "B760M GAMING PLUS WIFI DDR4 II (MS-7D99)",
    temperatures: [
      { id: "acpi", source: "acpitz", label: "Temp 1", celsius: 27.8 },
      { id: "cpu-core", source: "coretemp", label: "Core 0", celsius: 82 },
      { id: "cpu-package", source: "coretemp", label: "Package id 0", celsius: 26 },
      { id: "gpu", source: "nouveau", label: "Temp 1", celsius: 28 },
      { id: "board", source: "nct6687", label: "System", celsius: 31 },
      { id: "nvme-composite", source: "nvme", label: "Composite", celsius: 46.9 },
      { id: "nvme-sensor", source: "nvme", label: "Sensor 1", celsius: 55 },
    ],
    fans: [
      { id: "fan-1", source: "nct6687", label: "Fan 1", rpm: 1264 },
      { id: "fan-2", source: "nct6687", label: "CPU Fan", rpm: 980 },
    ],
    swapUsedBytes: 603_979_776,
    swapTotalBytes: 34_359_738_368,
  },
  services: [],
} satisfies HomeServerSnapshot;

test("defaults the ocean selector to lightweight background B", () => {
  expect(resolveOceanBackground(null)).toBe("b");
  expect(resolveOceanBackground("unknown")).toBe("b");
  expect(resolveOceanBackground("e")).toBe("e");
});

test("keeps the selected moving ocean active when reduced motion is preferred", () => {
  expect(shouldPlayOceanVideo({ pageVisible: true, prefersReducedMotion: true })).toBe(true);
  expect(shouldPlayOceanVideo({ pageVisible: false, prefersReducedMotion: true })).toBe(false);
});

test("formats binary host capacity values compactly", () => {
  expect(formatBinaryBytes(13_744_488_448)).toBe("12.8 GiB");
  expect(formatBinaryBytes(972_810_190_848)).toBe("906 GiB");
});

test("derives access badges from realtime service state without claiming unprobed IPv6", () => {
  const states = resolveHomeAccessStates([
    { id: "tailscale", state: "offline" },
    { id: "nps", state: "degraded" },
  ]);

  expect(states).toEqual({ tailscale: "offline", ipv6: "unknown", nps: "degraded" });
});

test("marks retained telemetry as stale after a refresh failure", () => {
  expect(resolveTelemetryFreshness({ hasData: true, isError: true })).toBe("stale");
  expect(resolveTelemetryFreshness({ hasData: true, isError: false })).toBe("live");
  expect(resolveTelemetryFreshness({ hasData: false, isError: true })).toBe("unavailable");
});

test("read-only service cards never become management links", () => {
  expect(resolveHomeServerCardHref("https://private.example.invalid", true)).toBeUndefined();
  expect(resolveHomeServerCardHref("https://private.example.invalid", false)).toBe("https://private.example.invalid");
});

test("selects stable summary temperatures and safe fan labels for the private panel", () => {
  expect(resolveHardwarePanel(hardwareSnapshot)).toEqual({
    boardModel: "B760M GAMING PLUS WIFI DDR4 II (MS-7D99)",
    temperatures: [
      { key: "cpu", label: "CPU", celsius: 26 },
      { key: "gpu", label: "GPU", celsius: 28 },
      { key: "board", label: "主板 / ACPI", celsius: 31 },
      { key: "nvme", label: "NVMe", celsius: 46.9 },
    ],
    fans: [
      { id: "fan-1", label: "风扇 1", rpm: 1264 },
      { id: "fan-2", label: "CPU Fan", rpm: 980 },
    ],
    swapUsedBytes: 603_979_776,
    swapTotalBytes: 34_359_738_368,
  });
});

test("keeps all summary slots explicit when a private sensor group is missing", () => {
  expect(resolveHardwarePanel({
    ...hardwareSnapshot,
    hardware: {
      temperatures: [],
      fans: [],
      swapUsedBytes: 0,
      swapTotalBytes: 0,
    },
  })).toMatchObject({
    temperatures: [
      { key: "cpu", celsius: undefined },
      { key: "gpu", celsius: undefined },
      { key: "board", celsius: undefined },
      { key: "nvme", celsius: undefined },
    ],
    fans: [],
  });
  expect(resolveHardwarePanel({ ...hardwareSnapshot, hardware: undefined })).toBeUndefined();
});
