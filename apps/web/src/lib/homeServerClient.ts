import type { ActionAuth } from "@dashwise/types/sdk";

export type HomeServerServiceState = "online" | "degraded" | "offline" | "unknown";

export type HomeServerService = {
  id: string;
  origin: "126f" | "hkvps";
  name: string;
  icon: string;
  state: HomeServerServiceState;
  metric: string;
  detail: string;
  href?: string;
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

export async function fetchHomeServerStatus(
  auth: ActionAuth,
  options?: {
    baseUrl?: string;
    fetch?: typeof fetch;
  },
): Promise<HomeServerSnapshot> {
  if (!auth.token) throw new Error("Unauthorized");
  const baseUrl = options?.baseUrl || (typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin);
  const fetchImpl = options?.fetch || fetch;
  const response = await fetchImpl(new URL("/api/v1/home-server/status", baseUrl), {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  const payload = await response.json() as HomeServerSnapshot | { error?: string };
  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Status collection failed");
  }
  return payload as HomeServerSnapshot;
}
