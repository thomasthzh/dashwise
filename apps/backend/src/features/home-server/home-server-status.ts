export type ServiceState = "online" | "degraded" | "offline" | "unknown";

export type HkvpsAppId =
  | "adguard"
  | "moonlight"
  | "netwatch"
  | "serviceHub"
  | "weiqi"
  | "syncaction"
  | "netdata"
  | "edge";

export type HkvpsAppsTelemetry = {
  available: boolean;
  host?: {
    cpuPercent: number;
    memoryPercent: number;
    diskPercent: number;
    uptimeSeconds: number;
    load1: number;
  };
  services: Partial<Record<HkvpsAppId, {
    state: ServiceState;
    online?: number;
    total?: number;
  }>>;
};

export type HomeServerTelemetry = {
  generatedAt: string;
  host: {
    hostname: string;
    uptimeSeconds: number;
    cpuPercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    diskUsedBytes: number;
    diskTotalBytes: number;
    load1: number;
  };
  services: {
    mcsmWeb: boolean;
    mcsmDaemon: boolean;
    mihomo: boolean;
    npc: boolean;
    beszel: boolean;
    harness: boolean;
  };
  minecraft: {
    online: boolean;
    playersOnline?: number;
    playersMax?: number;
    version?: string;
    latencyMs?: number;
  };
  tailscale: TailscaleSummary;
  hkvpsApps: HkvpsAppsTelemetry;
};

export type TailscaleSummary = {
  online: boolean;
  peerCount: number;
  ipv4?: string;
  ipv6?: string;
  hkvps: {
    online: boolean;
    connection: "direct" | "relay" | "offline" | "unknown";
    latencyMs?: number;
  };
};

export type HomeServerRuntime = {
  now: () => Date;
  readHost: () => Promise<HomeServerTelemetry["host"]>;
  isUnitActive: (unit: string) => Promise<boolean>;
  isHttpHealthy: (url: string) => Promise<boolean>;
  readMinecraft: () => Promise<HomeServerTelemetry["minecraft"]>;
  readTailscaleStatus: () => Promise<unknown>;
  pingTailscalePeer: (host: string) => Promise<number | undefined>;
  readHkvpsApps: () => Promise<HkvpsAppsTelemetry>;
};

export type HomeServerSnapshot = {
  generatedAt: string;
  host: {
    hostname: string;
    uptimeSeconds: number;
    cpuPercent: number;
    memoryPercent: number;
    diskPercent: number;
    load1: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    diskUsedBytes: number;
    diskTotalBytes: number;
  };
  services: HomeServerService[];
};

export type HomeServerService = {
  id:
    | "mcsmanager"
    | "minecraft"
    | "zashboard"
    | "beszel"
    | "monitoring"
    | "tailscale"
    | "nps"
    | "hkvps"
    | "harness"
    | "hkvps-adguard"
    | "hkvps-moonlight"
    | "hkvps-netwatch"
    | "hkvps-service-hub"
    | "hkvps-weiqi"
    | "hkvps-syncaction"
    | "hkvps-netdata"
    | "hkvps-edge";
  origin: "126f" | "hkvps";
  name: string;
  icon: string;
  state: ServiceState;
  metric: string;
  detail: string;
  href?: string;
};

const hkvpsCardDefinitions: Array<{
  id: HomeServerService["id"];
  probe: HkvpsAppId;
  name: string;
  icon: string;
  onlineMetric: string;
  detail: string;
}> = [
  { id: "hkvps-adguard", probe: "adguard", name: "AdGuard Home", icon: "simple-icons:adguard", onlineMetric: "DNS online", detail: "DNS + Admin · :3001" },
  { id: "hkvps-moonlight", probe: "moonlight", name: "Moonlight Blog", icon: "fa6-solid:moon", onlineMetric: "Blog online", detail: "Publishing · :3100" },
  { id: "hkvps-netwatch", probe: "netwatch", name: "Netwatch", icon: "fa6-solid:wave-square", onlineMetric: "Dashboard online", detail: "Network watch · :29876" },
  { id: "hkvps-service-hub", probe: "serviceHub", name: "Service Hub", icon: "fa6-solid:layer-group", onlineMetric: "Hub online", detail: "Launcher · :3000" },
  { id: "hkvps-weiqi", probe: "weiqi", name: "Weiqi Battle", icon: "fa6-solid:chess-board", onlineMetric: "Game online", detail: "Realtime server · :8000" },
  { id: "hkvps-syncaction", probe: "syncaction", name: "SyncAction", icon: "fa6-solid:arrows-rotate", onlineMetric: "Endpoints online", detail: "Public + Admin endpoints" },
  { id: "hkvps-netdata", probe: "netdata", name: "Netdata", icon: "simple-icons:netdata", onlineMetric: "Metrics online", detail: "Detailed telemetry · :19999" },
  { id: "hkvps-edge", probe: "edge", name: "hkvps Edge", icon: "fa6-solid:cloud", onlineMetric: "Edge online", detail: "Caddy · Cloudflare · Xray" },
];

function buildHkvpsAppCards(telemetry: HkvpsAppsTelemetry): HomeServerService[] {
  return hkvpsCardDefinitions.map((definition) => {
    const probe = telemetry.services[definition.probe];
    const state = telemetry.available ? probe?.state || "unknown" : "offline";
    const counted = probe?.online != null && probe?.total != null;
    return {
      id: definition.id,
      origin: "hkvps",
      name: definition.name,
      icon: definition.icon,
      state,
      metric: counted
        ? `${probe.online} / ${probe.total} ${definition.probe === "syncaction" ? "endpoints" : "edge"}`
        : state === "online"
        ? definition.onlineMetric
        : state === "degraded"
        ? "Partially online"
        : state === "unknown"
        ? "Awaiting probe"
        : "Offline",
      detail: definition.detail,
    };
  });
}

function percent(used: number, total: number) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((used / total) * 1_000) / 10;
}

function optionalUrl(urls: Record<string, string | undefined>, key: string) {
  const value = urls[key]?.trim();
  return value || undefined;
}

export function buildHomeServerSnapshot(
  telemetry: HomeServerTelemetry,
  urls: Record<string, string | undefined>,
): HomeServerSnapshot {
  const memoryPercent = percent(telemetry.host.memoryUsedBytes, telemetry.host.memoryTotalBytes);
  const diskPercent = percent(telemetry.host.diskUsedBytes, telemetry.host.diskTotalBytes);
  const mcsState: ServiceState = telemetry.services.mcsmWeb && telemetry.services.mcsmDaemon
    ? "online"
    : telemetry.services.mcsmWeb || telemetry.services.mcsmDaemon
    ? "degraded"
    : "offline";
  const mcsMetric = telemetry.services.mcsmWeb && telemetry.services.mcsmDaemon
    ? "Web + Daemon"
    : telemetry.services.mcsmWeb
    ? "Web online"
    : telemetry.services.mcsmDaemon
    ? "Daemon online"
    : "Offline";
  const mcsDetail = mcsState === "online"
    ? "MCSManager 10.18.0"
    : telemetry.services.mcsmWeb
    ? "Daemon offline"
    : telemetry.services.mcsmDaemon
    ? "Web offline"
    : "Web and daemon offline";

  const minecraftMetric = telemetry.minecraft.online
    ? `${telemetry.minecraft.playersOnline ?? 0} / ${telemetry.minecraft.playersMax ?? 0}`
    : "Offline";
  const minecraftDetail = telemetry.minecraft.online
    ? [telemetry.minecraft.version || "Minecraft", telemetry.minecraft.latencyMs == null ? "" : `${telemetry.minecraft.latencyMs} ms`]
      .filter(Boolean)
      .join(" · ")
    : "TCP :25565 unavailable";

  const hkvpsMetric = telemetry.tailscale.hkvps.latencyMs == null
    ? telemetry.tailscale.hkvps.online ? "Online" : "Offline"
    : `${telemetry.tailscale.hkvps.latencyMs} ms`;

  return {
    generatedAt: telemetry.generatedAt,
    host: {
      ...telemetry.host,
      cpuPercent: Math.round(telemetry.host.cpuPercent * 10) / 10,
      memoryPercent,
      diskPercent,
    },
    services: [
      {
        id: "mcsmanager",
        origin: "126f",
        name: "MCSManager",
        icon: "simple-icons:minecraft",
        state: mcsState,
        metric: mcsMetric,
        detail: mcsDetail,
        href: optionalUrl(urls, "mcsmanager"),
      },
      {
        id: "minecraft",
        origin: "126f",
        name: "Minecraft",
        icon: "fa6-solid:cube",
        state: telemetry.minecraft.online ? "online" : "offline",
        metric: minecraftMetric,
        detail: minecraftDetail,
      },
      {
        id: "zashboard",
        origin: "126f",
        name: "Zashboard",
        icon: "fa6-solid:route",
        state: telemetry.services.mihomo ? "online" : "offline",
        metric: telemetry.services.mihomo ? "Mihomo online" : "Mihomo offline",
        detail: "Controller · :9090",
        href: optionalUrl(urls, "zashboard"),
      },
      {
        id: "beszel",
        origin: "126f",
        name: "Beszel",
        icon: "fa6-solid:chart-line",
        state: telemetry.services.beszel ? "online" : "offline",
        metric: telemetry.services.beszel ? "Hub online" : "Hub offline",
        detail: "126f + hkvps",
        href: optionalUrl(urls, "beszel"),
      },
      {
        id: "monitoring",
        origin: "126f",
        name: "126f Monitoring",
        icon: "fa6-solid:gauge-high",
        state: "online",
        metric: `${Math.round(telemetry.host.cpuPercent)}% CPU`,
        detail: `${Math.round(memoryPercent)}% RAM · ${Math.round(diskPercent)}% disk`,
        href: optionalUrl(urls, "monitoring") || "/apps/monitoring",
      },
      {
        id: "tailscale",
        origin: "126f",
        name: "Tailscale",
        icon: "simple-icons:tailscale",
        state: telemetry.tailscale.online ? "online" : "offline",
        metric: `${telemetry.tailscale.peerCount} peers`,
        detail: telemetry.tailscale.ipv4 || telemetry.tailscale.ipv6 || "Tailnet unavailable",
      },
      {
        id: "nps",
        origin: "126f",
        name: "NPS",
        icon: "fa6-solid:network-wired",
        state: telemetry.services.npc ? "online" : "offline",
        metric: telemetry.services.npc ? "Client online" : "Client offline",
        detail: "Public IPv4 fallback",
      },
      {
        id: "hkvps",
        origin: "hkvps",
        name: "hkvps",
        icon: "fa6-solid:server",
        state: telemetry.tailscale.hkvps.online ? "online" : "offline",
        metric: telemetry.hkvpsApps.host
          ? `${Math.round(telemetry.hkvpsApps.host.cpuPercent)}% CPU · ${Math.round(telemetry.hkvpsApps.host.memoryPercent)}% RAM`
          : hkvpsMetric,
        detail: `${telemetry.tailscale.hkvps.latencyMs == null ? "" : `${telemetry.tailscale.hkvps.latencyMs} ms · `}Tailscale ${telemetry.tailscale.hkvps.connection}`,
        href: optionalUrl(urls, "hkvps"),
      },
      ...buildHkvpsAppCards(telemetry.hkvpsApps),
      {
        id: "harness",
        origin: "126f",
        name: "DeepSeek Harness",
        icon: "fa6-solid:terminal",
        state: telemetry.services.harness ? "online" : "offline",
        metric: telemetry.services.harness ? "Ready" : "Unavailable",
        detail: "Tailscale HTTPS",
        href: optionalUrl(urls, "harness"),
      },
    ],
  };
}

export function parseTailscaleStatus(value: unknown): TailscaleSummary {
  const root = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const self = root.Self && typeof root.Self === "object" ? root.Self as Record<string, unknown> : {};
  const peerMap = root.Peer && typeof root.Peer === "object" ? root.Peer as Record<string, unknown> : {};
  const peers = Object.values(peerMap).filter((peer): peer is Record<string, unknown> => !!peer && typeof peer === "object");
  const ips = Array.isArray(self.TailscaleIPs)
    ? self.TailscaleIPs.filter((ip): ip is string => typeof ip === "string")
    : [];
  const hkvps = peers.find((peer) => String(peer.HostName || "").toLowerCase() === "hkvps");
  const hkvpsOnline = hkvps?.Online === true;
  const currentAddress = typeof hkvps?.CurAddr === "string" ? hkvps.CurAddr.trim() : "";
  const relay = typeof hkvps?.Relay === "string" ? hkvps.Relay.trim() : "";

  return {
    online: self.Online === true,
    peerCount: peers.length,
    ipv4: ips.find((ip) => !ip.includes(":")),
    ipv6: ips.find((ip) => ip.includes(":")),
    hkvps: {
      online: hkvpsOnline,
      connection: !hkvpsOnline
        ? "offline"
        : currentAddress
        ? "direct"
        : relay
        ? "relay"
        : "unknown",
    },
  };
}

export async function collectHomeServerTelemetry(
  runtime: HomeServerRuntime,
): Promise<HomeServerTelemetry> {
  const [
    host,
    mcsmWeb,
    mcsmDaemon,
    mihomo,
    npc,
    beszel,
    harness,
    minecraft,
    rawTailscale,
    hkvpsLatencyMs,
    hkvpsApps,
  ] = await Promise.all([
    runtime.readHost(),
    runtime.isUnitActive("mcsm-web"),
    runtime.isUnitActive("mcsm-daemon"),
    runtime.isUnitActive("mihomo"),
    runtime.isUnitActive("npc"),
    runtime.isHttpHealthy("http://127.0.0.1:8091/health"),
    runtime.isHttpHealthy("http://127.0.0.1:3080/"),
    runtime.readMinecraft(),
    runtime.readTailscaleStatus(),
    runtime.pingTailscalePeer("100.122.69.109"),
    runtime.readHkvpsApps(),
  ]);
  const tailscale = parseTailscaleStatus(rawTailscale);

  return {
    generatedAt: runtime.now().toISOString(),
    host,
    services: {
      mcsmWeb,
      mcsmDaemon,
      mihomo,
      npc,
      beszel,
      harness,
    },
    minecraft,
    hkvpsApps,
    tailscale: {
      ...tailscale,
      hkvps: {
        ...tailscale.hkvps,
        latencyMs: hkvpsLatencyMs,
      },
    },
  };
}
