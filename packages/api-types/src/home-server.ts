export type HomeServerServiceState = "online" | "degraded" | "offline" | "unknown";

export type HomeServerService = {
  id: string;
  origin: "126f" | "hkvps" | "remote";
  name: string;
  icon: string;
  state: HomeServerServiceState;
  metric: string;
  detail: string;
  href?: string;
};

export type HardwareTemperature = {
  id: string;
  source: string;
  label: string;
  celsius: number;
};

export type HardwareFan = {
  id: string;
  source: string;
  label: string;
  rpm: number;
};

export type HardwareTelemetry = {
  boardModel?: string;
  temperatures: HardwareTemperature[];
  fans: HardwareFan[];
  swapUsedBytes: number;
  swapTotalBytes: number;
};

export type HomeServerHost = {
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

export type HomeServerSnapshot = {
  generatedAt: string;
  host: HomeServerHost;
  hardware?: HardwareTelemetry;
  services: HomeServerService[];
};

export type PublicHomeServerService = Omit<HomeServerService, "origin" | "href"> & {
  origin: "126f" | "remote";
};

export type PublicHomeServerSnapshot = Omit<HomeServerSnapshot, "hardware" | "services"> & {
  services: PublicHomeServerService[];
};
