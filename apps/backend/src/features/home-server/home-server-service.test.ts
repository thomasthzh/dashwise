import { expect, test } from "bun:test";

import { createHomeServerStatusService } from "./home-server-service";
import type { HomeServerTelemetry } from "./home-server-status";

const telemetry: HomeServerTelemetry = {
  generatedAt: "2026-08-14T00:00:00.000Z",
  host: {
    hostname: "126f",
    uptimeSeconds: 1,
    cpuPercent: 1,
    memoryUsedBytes: 1,
    memoryTotalBytes: 10,
    diskUsedBytes: 1,
    diskTotalBytes: 10,
    load1: 0,
  },
  hardware: {
    temperatures: [],
    fans: [],
    swapUsedBytes: 0,
    swapTotalBytes: 0,
  },
  services: {
    mcsmWeb: true,
    mcsmDaemon: true,
    mihomo: true,
    npc: true,
    beszel: true,
    harness: true,
    router: true,
  },
  netalertx: { available: true, onlineDevices: 11, totalDevices: 15 },
  minecraft: { online: true },
  tailscale: {
    online: true,
    peerCount: 1,
    hkvps: { online: true, connection: "direct" },
  },
  hkvpsApps: { available: false, services: {} },
};

test("home server status service serves stale data while refreshing an expired sample", async () => {
  let clock = 1_000;
  let calls = 0;
  let completeRefresh: ((value: HomeServerTelemetry) => void) | undefined;
  const pendingRefresh = new Promise<HomeServerTelemetry>((resolve) => {
    completeRefresh = resolve;
  });
  const service = createHomeServerStatusService({
    collect: async () => {
      calls += 1;
      if (calls === 2) return pendingRefresh;
      return { ...telemetry, generatedAt: `sample-${calls}` };
    },
    now: () => clock,
    ttlMs: 5_000,
    urls: { beszel: "http://beszel.test" },
  });

  const first = await service.read();
  const second = await service.read();
  expect(first).toBe(second);
  expect(calls).toBe(1);

  clock += 5_001;
  const stale = await service.read();
  expect(stale).toBe(first);
  expect(calls).toBe(2);

  completeRefresh?.({ ...telemetry, generatedAt: "sample-2" });
  await pendingRefresh;
  await Promise.resolve();

  const refreshed = await service.read();
  expect(refreshed).not.toBe(first);
  expect(refreshed.generatedAt).toBe("sample-2");
});

test("home server status service deduplicates the initial cold collection", async () => {
  let calls = 0;
  let complete: ((value: HomeServerTelemetry) => void) | undefined;
  const pending = new Promise<HomeServerTelemetry>((resolve) => {
    complete = resolve;
  });
  const service = createHomeServerStatusService({
    collect: () => {
      calls += 1;
      return pending;
    },
    now: () => 1_000,
    ttlMs: 5_000,
    urls: {},
  });

  const first = service.read();
  const second = service.read();
  expect(calls).toBe(1);

  complete?.({ ...telemetry, generatedAt: "sample-1" });

  expect(await first).toBe(await second);
});
