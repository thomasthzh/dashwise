import {
  buildHomeServerSnapshot,
  type HomeServerSnapshot,
  type HomeServerTelemetry,
} from "./home-server-status";

export function createHomeServerStatusService(options: {
  collect: () => Promise<HomeServerTelemetry>;
  now: () => number;
  ttlMs: number;
  urls: Record<string, string | undefined>;
}) {
  let cached: HomeServerSnapshot | undefined;
  let expiresAt = 0;
  let inFlight: Promise<HomeServerSnapshot> | undefined;

  const refresh = () => {
    if (inFlight) return inFlight;

    inFlight = options.collect()
      .then((telemetry) => {
        cached = buildHomeServerSnapshot(telemetry, options.urls);
        expiresAt = options.now() + options.ttlMs;
        return cached;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };

  return {
    async read(): Promise<HomeServerSnapshot> {
      const now = options.now();
      if (cached && now < expiresAt) return cached;
      if (cached) {
        void refresh().catch(() => undefined);
        return cached;
      }
      return refresh();
    },
  };
}
