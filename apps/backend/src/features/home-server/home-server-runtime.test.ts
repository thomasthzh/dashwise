import { describe, expect, test } from "bun:test";
import { createServer } from "node:net";

import {
  calculateCpuPercent,
  createHomeServerRuntime,
  defaultHomeServerRuntime,
  parseMinecraftStatusPayload,
  parseHkvpsAppsPayload,
  parseTailscalePingOutput,
  pingMinecraftServer,
} from "./home-server-runtime";

function encodeVarInt(value: number) {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return Buffer.from(bytes);
}

function minecraftStatusPacket(payload: object) {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const body = Buffer.concat([encodeVarInt(0), encodeVarInt(json.length), json]);
  return Buffer.concat([encodeVarInt(body.length), body]);
}

describe("126f home server runtime parsers", () => {
  test("calculates CPU usage from two cumulative samples", () => {
    expect(calculateCpuPercent(
      { idle: 1_000, total: 4_000 },
      { idle: 1_250, total: 5_000 },
    )).toBe(75);
    expect(calculateCpuPercent(
      { idle: 100, total: 100 },
      { idle: 100, total: 100 },
    )).toBe(0);
  });

  test("extracts player and version data from a Minecraft status response", () => {
    expect(parseMinecraftStatusPayload(JSON.stringify({
      version: { name: "NeoForge 1.21.1" },
      players: { online: 3, max: 20 },
    }))).toEqual({
      online: true,
      playersOnline: 3,
      playersMax: 20,
      version: "NeoForge 1.21.1",
    });
  });

  test("extracts direct Tailscale latency from ping output", () => {
    expect(parseTailscalePingOutput(
      "pong from hkvps (100.122.69.109) via 103.231.56.42:41641 in 46ms\n",
    )).toBe(46);
    expect(parseTailscalePingOutput("timed out\n")).toBeUndefined();
  });

  test("accepts only the hkvps exporter schema used by homepage cards", () => {
    expect(parseHkvpsAppsPayload({
      host: { cpuPercent: 8.5, memoryPercent: 14.6, diskPercent: 34.8, uptimeSeconds: 900, load1: 0.42 },
      services: {
        adguard: { state: "online" },
        syncaction: { state: "degraded", online: 1, total: 2 },
        injected: { state: "online", metric: "untrusted" },
      },
    })).toEqual({
      available: true,
      host: { cpuPercent: 8.5, memoryPercent: 14.6, diskPercent: 34.8, uptimeSeconds: 900, load1: 0.42 },
      services: {
        adguard: { state: "online" },
        syncaction: { state: "degraded", online: 1, total: 2 },
      },
    });
  });

  test("performs a Minecraft server-list ping against a TCP endpoint", async () => {
    const server = createServer((socket) => {
      socket.once("data", () => {
        socket.end(minecraftStatusPacket({
          version: { name: "NeoForge 1.21.1" },
          players: { online: 1, max: 20 },
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");

    try {
      const status = await pingMinecraftServer("127.0.0.1", address.port, 1_000);
      expect(status).toMatchObject({
        online: true,
        playersOnline: 1,
        playersMax: 20,
        version: "NeoForge 1.21.1",
      });
      if (!status.online) throw new Error("Expected the test Minecraft server to be online");
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  test("creates the production probe adapter from injectable system primitives", async () => {
    let cpuRead = 0;
    const runtime = createHomeServerRuntime({
      now: () => new Date("2026-08-14T02:00:00.000Z"),
      hostname: () => "test-host",
      uptime: () => 123,
      totalmem: () => 1_000,
      freemem: () => 250,
      loadavg: () => [1.5, 1, 0.5],
      cpus: () => {
        cpuRead += 1;
        return cpuRead === 1
          ? [{ times: { idle: 1_000, user: 2_000, sys: 1_000, nice: 0, irq: 0 } }]
          : [{ times: { idle: 1_250, user: 2_750, sys: 1_000, nice: 0, irq: 0 } }];
      },
      statfs: async () => ({ bsize: 1, blocks: 1_000, bfree: 400 }),
      sleep: async () => undefined,
      run: async (command, args) => ({
        exitCode: command === "tailscale" || (command === "systemctl" && args.includes("mcsm-web")) ? 0 : 1,
        stdout: command === "tailscale" && args[0] === "status"
          ? '{"Self":{"Online":true}}'
          : command === "tailscale"
          ? "pong from hkvps in 48ms"
          : "",
      }),
      fetch: async (url) => ({ ok: url.includes(":8091") }),
      fetchJson: async () => ({
        host: { cpuPercent: 4, memoryPercent: 20, diskPercent: 35, uptimeSeconds: 100, load1: 0.2 },
        services: { edge: { state: "online", online: 3, total: 3 } },
      }),
      pingMinecraft: async () => ({ online: true, playersOnline: 0, playersMax: 20, version: "1.21.1", latencyMs: 1 }),
    });

    await expect(runtime.readHost()).resolves.toMatchObject({
      hostname: "test-host",
      uptimeSeconds: 123,
      cpuPercent: 75,
      memoryUsedBytes: 750,
      memoryTotalBytes: 1_000,
      diskUsedBytes: 600,
      diskTotalBytes: 1_000,
      load1: 1.5,
    });
    await expect(runtime.isUnitActive("mcsm-web")).resolves.toBe(true);
    await expect(runtime.isUnitActive("npc")).resolves.toBe(false);
    await expect(runtime.isHttpHealthy("http://127.0.0.1:8091/health")).resolves.toBe(true);
    await expect(runtime.readTailscaleStatus()).resolves.toEqual({ Self: { Online: true } });
    await expect(runtime.pingTailscalePeer("hkvps")).resolves.toBe(48);
    await expect(runtime.readHkvpsApps()).resolves.toMatchObject({
      available: true,
      services: { edge: { state: "online", online: 3, total: 3 } },
    });
  });

  test("exposes a complete default runtime for the production route", () => {
    for (const method of [
      "now",
      "readHost",
      "isUnitActive",
      "isHttpHealthy",
      "readMinecraft",
      "readTailscaleStatus",
      "pingTailscalePeer",
      "readHkvpsApps",
    ] as const) {
      expect(defaultHomeServerRuntime[method]).toBeFunction();
    }
  });
});
