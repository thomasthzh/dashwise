import { expect, test } from "bun:test";

import { createHomeServerStatusService } from "./home-server-service";
import type { HomeServerTelemetry } from "./home-server-status";

test("home server status service reuses a fresh sample and refreshes expired data", async () => {
  let clock = 1_000;
  let calls = 0;
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
  const service = createHomeServerStatusService({
    collect: async () => {
      calls += 1;
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
  const refreshed = await service.read();
  expect(refreshed).not.toBe(first);
  expect(refreshed.generatedAt).toBe("sample-2");
  expect(calls).toBe(2);
});
