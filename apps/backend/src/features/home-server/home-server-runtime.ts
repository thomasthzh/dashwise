import { createConnection } from "node:net";
import { statfs } from "node:fs/promises";
import { cpus, freemem, hostname, loadavg, totalmem, uptime } from "node:os";

import {
  readLinuxHardwareTelemetry,
  type HardwareTelemetry,
} from "./home-server-hardware";
import type {
  HkvpsAppId,
  HkvpsAppsTelemetry,
  HomeServerRuntime,
  NetAlertXTelemetry,
  ServiceState,
} from "./home-server-status";

export type HomeServerRuntimeDependencies = {
  now: () => Date;
  hostname: () => string;
  uptime: () => number;
  totalmem: () => number;
  freemem: () => number;
  loadavg: () => number[];
  cpus: () => Array<{ times: { idle: number; user: number; sys: number; nice: number; irq: number } }>;
  statfs: (path: string) => Promise<{ bsize: number; blocks: number; bfree: number }>;
  readHardware: () => Promise<HardwareTelemetry>;
  sleep: (milliseconds: number) => Promise<unknown>;
  run: (command: string, args: string[]) => Promise<{ exitCode: number; stdout: string }>;
  fetch: (url: string) => Promise<{ ok: boolean }>;
  fetchJson: (url: string) => Promise<unknown>;
  fetchNetAlertX: () => Promise<unknown>;
  pingMinecraft: typeof pingMinecraftServer;
};

export function calculateCpuPercent(
  previous: { idle: number; total: number },
  current: { idle: number; total: number },
) {
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (!Number.isFinite(totalDelta) || totalDelta <= 0) return 0;
  const percent = ((totalDelta - Math.max(0, idleDelta)) / totalDelta) * 100;
  return Math.round(Math.max(0, Math.min(100, percent)) * 10) / 10;
}

export function parseMinecraftStatusPayload(payload: string) {
  const parsed = JSON.parse(payload) as {
    version?: { name?: unknown };
    players?: { online?: unknown; max?: unknown };
  };
  const playersOnline = Number(parsed.players?.online);
  const playersMax = Number(parsed.players?.max);
  return {
    online: true as const,
    playersOnline: Number.isFinite(playersOnline) ? playersOnline : 0,
    playersMax: Number.isFinite(playersMax) ? playersMax : 0,
    version: typeof parsed.version?.name === "string" ? parsed.version.name : "Minecraft",
  };
}

export function parseTailscalePingOutput(output: string) {
  const match = output.match(/\bin\s+(\d+(?:\.\d+)?)ms\b/i);
  return match ? Math.round(Number(match[1])) : undefined;
}

const hkvpsAppIds: HkvpsAppId[] = [
  "adguard",
  "moonlight",
  "netwatch",
  "serviceHub",
  "weiqi",
  "syncaction",
  "netdata",
  "edge",
];
const serviceStates = new Set<ServiceState>(["online", "degraded", "offline", "unknown"]);

function finiteNumber(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : undefined;
}

export function parseHkvpsAppsPayload(value: unknown): HkvpsAppsTelemetry {
  const root = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawHost = root.host && typeof root.host === "object" ? root.host as Record<string, unknown> : {};
  const cpuPercent = finiteNumber(rawHost.cpuPercent, 0, 100);
  const memoryPercent = finiteNumber(rawHost.memoryPercent, 0, 100);
  const diskPercent = finiteNumber(rawHost.diskPercent, 0, 100);
  const uptimeSeconds = finiteNumber(rawHost.uptimeSeconds);
  const load1 = finiteNumber(rawHost.load1);
  const host = [cpuPercent, memoryPercent, diskPercent, uptimeSeconds, load1].every((item) => item != null)
    ? { cpuPercent: cpuPercent!, memoryPercent: memoryPercent!, diskPercent: diskPercent!, uptimeSeconds: uptimeSeconds!, load1: load1! }
    : undefined;
  const rawServices = root.services && typeof root.services === "object"
    ? root.services as Record<string, unknown>
    : {};
  const services: HkvpsAppsTelemetry["services"] = {};

  for (const id of hkvpsAppIds) {
    const raw = rawServices[id];
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    if (typeof record.state !== "string" || !serviceStates.has(record.state as ServiceState)) continue;
    const online = finiteNumber(record.online, 0);
    const total = finiteNumber(record.total, 0);
    services[id] = {
      state: record.state as ServiceState,
      ...(online == null || total == null ? {} : {
        online: Math.round(online),
        total: Math.round(total),
      }),
    };
  }

  return { available: true, ...(host ? { host } : {}), services };
}

export function parseNetAlertXPayload(value: unknown): NetAlertXTelemetry {
  const root = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  const result = data.devices && typeof data.devices === "object"
    ? data.devices as Record<string, unknown>
    : {};
  if (!Array.isArray(result.devices)) {
    return { available: false, onlineDevices: 0, totalDevices: 0 };
  }

  let onlineDevices = 0;
  let totalDevices = 0;
  for (const item of result.devices) {
    if (!item || typeof item !== "object") continue;
    const device = item as Record<string, unknown>;
    const archived = device.devIsArchived === 1;
    if (archived) continue;
    totalDevices += 1;
    if (device.devPresentLastScan === 1) onlineDevices += 1;
  }
  return { available: true, onlineDevices, totalDevices };
}

export async function pingMinecraftServer(
  host: string,
  port: number,
  timeoutMs = 2_000,
) {
  const encodeVarInt = (value: number) => {
    const bytes: number[] = [];
    let remaining = value >>> 0;
    do {
      let byte = remaining & 0x7f;
      remaining >>>= 7;
      if (remaining !== 0) byte |= 0x80;
      bytes.push(byte);
    } while (remaining !== 0);
    return Buffer.from(bytes);
  };

  const readVarInt = (buffer: Buffer, start: number) => {
    let value = 0;
    let shift = 0;
    for (let index = start; index < buffer.length && index < start + 5; index += 1) {
      const byte = buffer[index];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return { value, bytes: index - start + 1 };
      shift += 7;
    }
    return null;
  };

  const address = Buffer.from(host, "utf8");
  const encodedPort = Buffer.allocUnsafe(2);
  encodedPort.writeUInt16BE(port);
  const handshakeBody = Buffer.concat([
    encodeVarInt(0),
    encodeVarInt(0),
    encodeVarInt(address.length),
    address,
    encodedPort,
    encodeVarInt(1),
  ]);
  const request = Buffer.concat([
    encodeVarInt(handshakeBody.length),
    handshakeBody,
    Buffer.from([1, 0]),
  ]);
  const startedAt = performance.now();

  return await new Promise<ReturnType<typeof parseMinecraftStatusPayload> & { latencyMs: number } | { online: false }>((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    let received = Buffer.alloc(0);
    const finish = (result: ReturnType<typeof parseMinecraftStatusPayload> & { latencyMs: number } | { online: false }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ online: false }), timeoutMs);

    socket.once("connect", () => socket.write(request));
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      const packetLength = readVarInt(received, 0);
      if (!packetLength || received.length < packetLength.bytes + packetLength.value) return;
      const packetId = readVarInt(received, packetLength.bytes);
      if (!packetId || packetId.value !== 0) return finish({ online: false });
      const jsonLength = readVarInt(received, packetLength.bytes + packetId.bytes);
      if (!jsonLength) return;
      const jsonStart = packetLength.bytes + packetId.bytes + jsonLength.bytes;
      if (received.length < jsonStart + jsonLength.value) return;

      clearTimeout(timer);
      try {
        const payload = received.subarray(jsonStart, jsonStart + jsonLength.value).toString("utf8");
        finish({
          ...parseMinecraftStatusPayload(payload),
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        });
      } catch {
        finish({ online: false });
      }
    });
    socket.once("error", () => {
      clearTimeout(timer);
      finish({ online: false });
    });
    socket.once("close", () => {
      clearTimeout(timer);
      if (!settled) finish({ online: false });
    });
  });
}

export function createHomeServerRuntime(
  dependencies: HomeServerRuntimeDependencies,
): HomeServerRuntime {
  const sampleCpu = () => dependencies.cpus().reduce(
    (sample, cpu) => {
      const total = cpu.times.idle + cpu.times.user + cpu.times.sys + cpu.times.nice + cpu.times.irq;
      return {
        idle: sample.idle + cpu.times.idle,
        total: sample.total + total,
      };
    },
    { idle: 0, total: 0 },
  );

  return {
    now: dependencies.now,
    readHost: async () => {
      const previousCpu = sampleCpu();
      const [, filesystem] = await Promise.all([
        dependencies.sleep(120),
        dependencies.statfs("/"),
      ]);
      const currentCpu = sampleCpu();
      const memoryTotalBytes = dependencies.totalmem();
      const memoryUsedBytes = Math.max(0, memoryTotalBytes - dependencies.freemem());
      const diskTotalBytes = filesystem.bsize * filesystem.blocks;
      const diskUsedBytes = Math.max(0, diskTotalBytes - filesystem.bsize * filesystem.bfree);

      return {
        hostname: dependencies.hostname(),
        uptimeSeconds: Math.round(dependencies.uptime()),
        cpuPercent: calculateCpuPercent(previousCpu, currentCpu),
        memoryUsedBytes,
        memoryTotalBytes,
        diskUsedBytes,
        diskTotalBytes,
        load1: dependencies.loadavg()[0] ?? 0,
      };
    },
    readHardware: async () => {
      try {
        return await dependencies.readHardware();
      } catch {
        return {
          temperatures: [],
          fans: [],
          swapUsedBytes: 0,
          swapTotalBytes: 0,
        };
      }
    },
    isUnitActive: async (unit) => {
      try {
        return (await dependencies.run("systemctl", ["is-active", "--quiet", unit])).exitCode === 0;
      } catch {
        return false;
      }
    },
    isHttpHealthy: async (url) => {
      try {
        return (await dependencies.fetch(url)).ok;
      } catch {
        return false;
      }
    },
    readMinecraft: () => dependencies.pingMinecraft("127.0.0.1", 25565, 2_000),
    readTailscaleStatus: async () => {
      try {
        const result = await dependencies.run("tailscale", ["status", "--json"]);
        return result.exitCode === 0 ? JSON.parse(result.stdout) : {};
      } catch {
        return {};
      }
    },
    pingTailscalePeer: async (host) => {
      try {
        const result = await dependencies.run("tailscale", ["ping", "--timeout=2s", "--c=1", host]);
        return parseTailscalePingOutput(result.stdout);
      } catch {
        return undefined;
      }
    },
    readHkvpsApps: async () => {
      try {
        return parseHkvpsAppsPayload(await dependencies.fetchJson("http://100.122.69.109:9126/status"));
      } catch {
        return { available: false, services: {} };
      }
    },
    readNetAlertX: async () => {
      try {
        return parseNetAlertXPayload(await dependencies.fetchNetAlertX());
      } catch {
        return { available: false, onlineDevices: 0, totalDevices: 0 };
      }
    },
  };
}

async function runCommand(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout: `${stdout}\n${stderr}`.trim() };
}

export const defaultHomeServerRuntime = createHomeServerRuntime({
  now: () => new Date(),
  hostname,
  uptime,
  totalmem,
  freemem,
  loadavg,
  cpus,
  statfs,
  readHardware: readLinuxHardwareTelemetry,
  sleep: (milliseconds) => Bun.sleep(milliseconds),
  run: runCommand,
  fetch: (url) => fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(1_800),
  }),
  fetchJson: async (url) => {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(1_800),
    });
    if (!response.ok) throw new Error(`hkvps exporter returned HTTP ${response.status}`);
    return response.json();
  },
  fetchNetAlertX: async () => {
    const token = Bun.env.HOME_SERVER_NETALERTX_TOKEN?.trim();
    if (!token) throw new Error("NetAlertX API token is not configured");
    const response = await fetch("http://127.0.0.1:20212/graphql", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(1_800),
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "{ devices { devices { devPresentLastScan devIsArchived } } }",
      }),
    });
    if (!response.ok) throw new Error(`NetAlertX API returned HTTP ${response.status}`);
    return response.json();
  },
  pingMinecraft: pingMinecraftServer,
});
