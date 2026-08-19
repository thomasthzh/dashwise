import { describe, expect, test } from "bun:test";

import {
  buildHomeServerSnapshot,
  collectHomeServerTelemetry,
  parseTailscaleStatus,
  toPublicHomeServerSnapshot,
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
  hardware: {
    boardModel: "PRIVATE-MS-7D99",
    temperatures: [{
      id: "coretemp:private:temp1",
      source: "coretemp",
      label: "PRIVATE-CPU-SENSOR",
      celsius: 61.2,
    }],
    fans: [{
      id: "nct6687:private:fan1",
      source: "nct6687",
      label: "PRIVATE-CPU-FAN",
      rpm: 1264,
    }],
    swapUsedBytes: 603_979_776,
    swapTotalBytes: 34_359_738_368,
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
      netalertx: "https://zhou12600kf.example.ts.net:20211/",
      router: "https://zhou12600kf.example.ts.net:12443/",
    });

    expect(snapshot.services.map((service) => service.id)).toEqual([
      "mcsmanager",
      "minecraft",
      "zashboard",
      "beszel",
      "monitoring",
      "netalertx",
      "router",
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
    expect(snapshot.services.find((service) => service.id === "netalertx")).toMatchObject({
      state: "online",
      metric: "11 / 15 online",
      href: "https://zhou12600kf.example.ts.net:20211/",
    });
    expect(snapshot.services.find((service) => service.id === "router")).toMatchObject({
      state: "online",
      metric: "Gateway reachable",
      href: "https://zhou12600kf.example.ts.net:12443/",
    });
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
    expect(snapshot.hardware).toEqual(telemetry.hardware);
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

  test("publishes live status without management addresses or links", () => {
    const snapshot = buildHomeServerSnapshot(telemetry, {
      mcsmanager: "http://100.80.188.111:23333",
      zashboard: "http://100.80.188.111:60127",
      beszel: "http://100.80.188.111:8091",
      harness: "https://zhou12600kf.example.ts.net/",
      netalertx: "https://zhou12600kf.example.ts.net:20211/",
      router: "https://zhou12600kf.example.ts.net:12443/",
    });
    (snapshot.host as typeof snapshot.host & { privateAddress: string }).privateAddress = "10.23.118.126";
    (snapshot.services[0] as typeof snapshot.services[number] & { adminUrl: string }).adminUrl = "https://admin.example.invalid";

    const publicSnapshot = toPublicHomeServerSnapshot(snapshot);
    const serializedServices = JSON.stringify(publicSnapshot.services);
    const serializedPublicSnapshot = JSON.stringify(publicSnapshot);

    expect(publicSnapshot.services).toHaveLength(snapshot.services.length);
    expect(publicSnapshot.services.every((service) => !("href" in service))).toBe(true);
    expect(publicSnapshot.services.find((service) => service.id === "minecraft")).toMatchObject({
      state: "online",
      metric: "3 / 20",
      detail: "游戏服务",
    });
    expect(publicSnapshot.services.find((service) => service.id === "tailscale")?.detail).toBe("私有组网");
    expect(publicSnapshot.services.find((service) => service.id === "netalertx")).toMatchObject({
      metric: "在线",
      detail: "局域网设备可见性",
    });
    expect(serializedServices).not.toContain("11 / 15");
    expect(publicSnapshot.host).toMatchObject({ hostname: "126f", cpuPercent: 18.4, memoryPercent: 42.7, diskPercent: 1.4 });
    expect(publicSnapshot).not.toHaveProperty("hardware");
    expect(serializedPublicSnapshot).not.toContain("PRIVATE-MS-7D99");
    expect(serializedPublicSnapshot).not.toContain("PRIVATE-CPU-SENSOR");
    expect(serializedPublicSnapshot).not.toContain("PRIVATE-CPU-FAN");
    expect(serializedPublicSnapshot).not.toContain("1264");
    expect(serializedPublicSnapshot).not.toContain("ZHOU12600kf");
    expect(serializedPublicSnapshot).not.toContain("10.23.118.126");
    expect(serializedPublicSnapshot).not.toContain("admin.example.invalid");
    expect(publicSnapshot.services.find((service) => service.id === "remote-host")?.name).toBe("远端服务器");
    expect(JSON.stringify(publicSnapshot)).not.toContain("hkvps");
    expect(serializedServices).not.toContain("100.80.188.111");
    expect(serializedServices).not.toContain("fd7a:115c:a1e0");
    expect(serializedServices).not.toContain("example.ts.net");
    expect(serializedServices).not.toMatch(/:\d{2,5}/);
    expect(serializedServices).not.toContain("http://");
    expect(serializedServices).not.toContain("https://");
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
      readHardware: async () => telemetry.hardware,
      isUnitActive: async (unit) => unit !== "npc",
      isHttpHealthy: async (url) => url.endsWith(":8091/health"),
      readNetAlertX: async () => ({ available: true, onlineDevices: 11, totalDevices: 15 }),
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
        router: false,
      },
      netalertx: { available: true, onlineDevices: 11, totalDevices: 15 },
      tailscale: {
        online: true,
        peerCount: 1,
        hkvps: { online: true, connection: "direct", latencyMs: 47 },
      },
      hkvpsApps: telemetry.hkvpsApps,
      hardware: telemetry.hardware,
    });
  });
});
