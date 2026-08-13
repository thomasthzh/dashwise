import { describe, expect, test } from "bun:test";

import {
  buildHomeServerSnapshot,
  collectHomeServerTelemetry,
  parseTailscaleStatus,
  type HomeServerTelemetry,
} from "./home-server-status";

const telemetry: HomeServerTelemetry = {
  generatedAt: "2026-08-14T00:00:00.000Z",
  host: {
    hostname: "ZHOU12600kf",
    uptimeSeconds: 86_400,
    cpuPercent: 18.4,
    memoryUsedBytes: 13_744_488_448,
    memoryTotalBytes: 32_212_254_720,
    diskUsedBytes: 13_958_643_712,
    diskTotalBytes: 972_810_190_848,
    load1: 1.24,
  },
  services: {
    mcsmWeb: true,
    mcsmDaemon: true,
    mihomo: true,
    npc: true,
    beszel: true,
    harness: true,
  },
  minecraft: {
    online: true,
    playersOnline: 3,
    playersMax: 20,
    version: "NeoForge 1.21.1",
    latencyMs: 2,
  },
  tailscale: {
    online: true,
    peerCount: 2,
    ipv4: "100.80.188.111",
    ipv6: "fd7a:115c:a1e0::f03a:bc70",
    hkvps: {
      online: true,
      connection: "direct",
      latencyMs: 46,
    },
  },
  hkvpsApps: {
    available: true,
    host: {
      cpuPercent: 8.5,
      memoryPercent: 14.6,
      diskPercent: 34.8,
      uptimeSeconds: 900_000,
      load1: 0.42,
    },
    services: {
      adguard: { state: "online" },
      moonlight: { state: "online" },
      netwatch: { state: "online" },
      serviceHub: { state: "online" },
      weiqi: { state: "online" },
      syncaction: { state: "online", online: 2, total: 2 },
      netdata: { state: "online" },
      edge: { state: "online", online: 3, total: 3 },
    },
  },
};

describe("126f home server status", () => {
  test("builds one real-time card for every deployed service", () => {
    const snapshot = buildHomeServerSnapshot(telemetry, {
      mcsmanager: "http://100.80.188.111:23333",
      zashboard: "http://100.80.188.111:60127",
      beszel: "http://100.80.188.111:8091",
      harness: "https://zhou12600kf.example.ts.net/",
    });

    expect(snapshot.services.map((service) => service.id)).toEqual([
      "mcsmanager",
      "minecraft",
      "zashboard",
      "beszel",
      "monitoring",
      "tailscale",
      "nps",
      "hkvps",
      "hkvps-adguard",
      "hkvps-moonlight",
      "hkvps-netwatch",
      "hkvps-service-hub",
      "hkvps-weiqi",
      "hkvps-syncaction",
      "hkvps-netdata",
      "hkvps-edge",
      "harness",
    ]);
    expect(snapshot.services.find((service) => service.id === "minecraft")).toMatchObject({
      state: "online",
      metric: "3 / 20",
      detail: "NeoForge 1.21.1 · 2 ms",
    });
    expect(snapshot.services.find((service) => service.id === "mcsmanager")?.state).toBe("online");
    expect(snapshot.services.find((service) => service.id === "hkvps")).toMatchObject({
      state: "online",
      metric: "9% CPU · 15% RAM",
      detail: "46 ms · Tailscale direct",
    });
    expect(snapshot.services.find((service) => service.id === "hkvps-syncaction")).toMatchObject({
      origin: "hkvps",
      state: "online",
      metric: "2 / 2 endpoints",
      detail: "Public + Admin endpoints",
    });
    expect(snapshot.host).toMatchObject({
      hostname: "ZHOU12600kf",
      cpuPercent: 18.4,
      memoryPercent: 42.7,
      diskPercent: 1.4,
    });
  });

  test("marks a partially running MCSManager pair as degraded", () => {
    const snapshot = buildHomeServerSnapshot({
      ...telemetry,
      services: { ...telemetry.services, mcsmDaemon: false },
    }, {});

    expect(snapshot.services.find((service) => service.id === "mcsmanager")).toMatchObject({
      state: "degraded",
      metric: "Web online",
      detail: "Daemon offline",
    });
  });

  test("parses Tailscale peers and distinguishes direct from relay paths", () => {
    const parsed = parseTailscaleStatus({
      Self: {
        Online: true,
        TailscaleIPs: ["100.80.188.111", "fd7a:115c:a1e0::f03a:bc70"],
      },
      Peer: {
        "node-key:one": {
          HostName: "hkvps",
          Online: true,
          CurAddr: "103.231.56.42:41641",
          Relay: "hkg",
        },
        "node-key:two": {
          HostName: "laptop",
          Online: false,
          CurAddr: "",
          Relay: "hkg",
        },
      },
    });

    expect(parsed).toEqual({
      online: true,
      peerCount: 2,
      ipv4: "100.80.188.111",
      ipv6: "fd7a:115c:a1e0::f03a:bc70",
      hkvps: {
        online: true,
        connection: "direct",
      },
    });
  });

  test("collects host and service probes into a single telemetry sample", async () => {
    const sample = await collectHomeServerTelemetry({
      now: () => new Date("2026-08-14T01:02:03.000Z"),
      readHost: async () => telemetry.host,
      isUnitActive: async (unit) => unit !== "npc",
      isHttpHealthy: async (url) => url.endsWith(":8091/health"),
      readMinecraft: async () => telemetry.minecraft,
      readTailscaleStatus: async () => ({
        Self: { Online: true, TailscaleIPs: ["100.80.188.111"] },
        Peer: {
          one: { HostName: "hkvps", Online: true, CurAddr: "1.2.3.4:41641" },
        },
      }),
      pingTailscalePeer: async () => 47,
      readHkvpsApps: async () => telemetry.hkvpsApps,
    });

    expect(sample).toMatchObject({
      generatedAt: "2026-08-14T01:02:03.000Z",
      services: {
        mcsmWeb: true,
        mcsmDaemon: true,
        mihomo: true,
        npc: false,
        beszel: true,
        harness: false,
      },
      tailscale: {
        online: true,
        peerCount: 1,
        hkvps: { online: true, connection: "direct", latencyMs: 47 },
      },
      hkvpsApps: telemetry.hkvpsApps,
    });
  });
});
