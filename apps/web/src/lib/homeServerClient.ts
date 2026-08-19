import type {
  ActionAuth,
  HomeServerSnapshot,
  PublicHomeServerSnapshot,
} from "@dashwise/types/sdk";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type {
  HardwareFan,
  HardwareTelemetry,
  HardwareTemperature,
  HomeServerService,
  HomeServerServiceState,
  HomeServerSnapshot,
  PublicHomeServerSnapshot,
} from "@dashwise/types/sdk";

export function shouldUsePrivateHomeServerStatus(token: string | null, readOnly = false) {
  return Boolean(token) && !readOnly;
}

export function resolveHomeServerWidgetPolicy(token: string | null, readOnly = false) {
  const usePrivateStatus = shouldUsePrivateHomeServerStatus(token, readOnly);
  return { usePrivateStatus, effectiveReadOnly: !usePrivateStatus };
}

export async function fetchHomeServerStatus(
  auth: ActionAuth,
  options?: {
    baseUrl?: string;
    fetch?: FetchLike;
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

export async function fetchPublicHomeServerStatus(options?: {
  baseUrl?: string;
  fetch?: FetchLike;
}): Promise<PublicHomeServerSnapshot> {
  const baseUrl = options?.baseUrl || (typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin);
  const fetchImpl = options?.fetch || fetch;
  const response = await fetchImpl(new URL("/api/v1/home-server/public-status", baseUrl), {
    credentials: "omit",
  });
  const payload = await response.json() as PublicHomeServerSnapshot | { error?: string };
  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Status collection failed");
  }
  return payload as PublicHomeServerSnapshot;
}
