import type {
  HardwareTelemetry,
  HomeServerService as ContractHomeServerService,
  HomeServerServiceState,
  HomeServerSnapshot as ContractHomeServerSnapshot,
  PublicHomeServerService as ContractPublicHomeServerService,
  PublicHomeServerSnapshot as ContractPublicHomeServerSnapshot,
} from "@dashwise/types/sdk";

export type ServiceState = HomeServerServiceState;

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

export type NetAlertXTelemetry = {
  available: boolean;
  onlineDevices: number;
  totalDevices: number;
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
  hardware: HardwareTelemetry;
  services: {
    mcsmWeb: boolean;
    mcsmDaemon: boolean;
    mihomo: boolean;
    npc: boolean;
    beszel: boolean;
    harness: boolean;
    router: boolean;
  };
  netalertx: NetAlertXTelemetry;
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
  readHardware: () => Promise<HardwareTelemetry>;
  isUnitActive: (unit: string) => Promise<boolean>;
  isHttpHealthy: (url: string) => Promise<boolean>;
  readMinecraft: () => Promise<HomeServerTelemetry["minecraft"]>;
  readTailscaleStatus: () => Promise<unknown>;
  pingTailscalePeer: (host: string) => Promise<number | undefined>;
  readHkvpsApps: () => Promise<HkvpsAppsTelemetry>;
  readNetAlertX: () => Promise<NetAlertXTelemetry>;
};

export type HomeServerService = Omit<ContractHomeServerService, "id" | "origin"> & {
  id:
    | "mcsmanager"
    | "minecraft"
    | "zashboard"
    | "beszel"
    | "monitoring"
    | "netalertx"
    | "router"
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
};

export type HomeServerSnapshot = Omit<ContractHomeServerSnapshot, "hardware" | "services"> & {
  hardware: HardwareTelemetry;
  services: HomeServerService[];
};

export type PublicHomeServerService = ContractPublicHomeServerService;
export type PublicHomeServerSnapshot = ContractPublicHomeServerSnapshot;

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
    hardware: telemetry.hardware,
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
        id: "netalertx",
        origin: "126f",
        name: "NetAlertX",
        icon: "fa6-solid:eye",
        state: telemetry.netalertx.available ? "online" : "offline",
        metric: telemetry.netalertx.available
          ? `${telemetry.netalertx.onlineDevices} / ${telemetry.netalertx.totalDevices} online`
          : "Scanner unavailable",
        detail: "LAN visibility · live discovery",
        href: optionalUrl(urls, "netalertx"),
      },
      {
        id: "router",
        origin: "126f",
        name: "LAN Router",
        icon: "fa6-solid:wifi",
        state: telemetry.services.router ? "online" : "offline",
        metric: telemetry.services.router ? "Gateway reachable" : "Gateway unavailable",
        detail: "DHCP · reservations · filters",
        href: optionalUrl(urls, "router"),
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

export function toPublicHomeServerSnapshot(snapshot: HomeServerSnapshot): PublicHomeServerSnapshot {
  const details: Record<HomeServerService["id"], string> = {
    mcsmanager: "服务器控制",
    minecraft: "游戏服务",
    zashboard: "网络控制器",
    beszel: "双主机监控",
    monitoring: "主机遥测",
    netalertx: "局域网设备可见性",
    router: "局域网网关管理",
    tailscale: "私有组网",
    nps: "公网中继",
    hkvps: "远端主机遥测",
    "hkvps-adguard": "DNS 服务",
    "hkvps-moonlight": "内容发布",
    "hkvps-netwatch": "网络观察",
    "hkvps-service-hub": "服务入口",
    "hkvps-weiqi": "实时游戏",
    "hkvps-syncaction": "端点健康",
    "hkvps-netdata": "详细遥测",
    "hkvps-edge": "边缘服务",
    harness: "私有工作区",
  };
  const identities: Partial<Record<HomeServerService["id"], { id: string; name: string }>> = {
    hkvps: { id: "remote-host", name: "远端服务器" },
    "hkvps-adguard": { id: "remote-adguard", name: "AdGuard Home" },
    "hkvps-moonlight": { id: "remote-moonlight", name: "Moonlight Blog" },
    "hkvps-netwatch": { id: "remote-netwatch", name: "Netwatch" },
    "hkvps-service-hub": { id: "remote-service-hub", name: "Service Hub" },
    "hkvps-weiqi": { id: "remote-weiqi", name: "Weiqi Battle" },
    "hkvps-syncaction": { id: "remote-syncaction", name: "SyncAction" },
    "hkvps-netdata": { id: "remote-netdata", name: "Netdata" },
    "hkvps-edge": { id: "remote-edge", name: "边缘服务" },
  };

  const host = snapshot.host;

  return {
    generatedAt: snapshot.generatedAt,
    host: {
      hostname: "126f",
      uptimeSeconds: host.uptimeSeconds,
      cpuPercent: host.cpuPercent,
      memoryUsedBytes: host.memoryUsedBytes,
      memoryTotalBytes: host.memoryTotalBytes,
      diskUsedBytes: host.diskUsedBytes,
      diskTotalBytes: host.diskTotalBytes,
      load1: host.load1,
      memoryPercent: host.memoryPercent,
      diskPercent: host.diskPercent,
    },
    services: snapshot.services.map((service) => {
      const identity = identities[service.id];
      return {
        id: identity?.id ?? service.id,
        origin: service.origin === "hkvps" ? "remote" : "126f",
        name: identity?.name ?? service.name,
        icon: service.icon,
        state: service.state,
        metric: service.id === "netalertx" || service.id === "router"
          ? service.state === "online" ? "在线" : service.state === "offline" ? "离线" : "未知"
          : service.metric,
        detail: details[service.id],
      };
    }),
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
    hardware,
    mcsmWeb,
    mcsmDaemon,
    mihomo,
    npc,
    beszel,
    harness,
    router,
    netalertx,
    minecraft,
    rawTailscale,
    hkvpsLatencyMs,
    hkvpsApps,
  ] = await Promise.all([
    runtime.readHost(),
    runtime.readHardware(),
    runtime.isUnitActive("mcsm-web"),
    runtime.isUnitActive("mcsm-daemon"),
    runtime.isUnitActive("mihomo"),
    runtime.isUnitActive("npc"),
    runtime.isHttpHealthy("http://127.0.0.1:8091/health"),
    runtime.isHttpHealthy("http://127.0.0.1:3080/"),
    runtime.isHttpHealthy("http://192.168.10.1/admin/login.asp"),
    runtime.readNetAlertX(),
    runtime.readMinecraft(),
    runtime.readTailscaleStatus(),
    runtime.pingTailscalePeer("100.122.69.109"),
    runtime.readHkvpsApps(),
  ]);
  const tailscale = parseTailscaleStatus(rawTailscale);

  return {
    generatedAt: runtime.now().toISOString(),
    host,
    hardware,
    services: {
      mcsmWeb,
      mcsmDaemon,
      mihomo,
      npc,
      beszel,
      harness,
      router,
    },
    netalertx,
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
