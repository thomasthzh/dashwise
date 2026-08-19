import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { Hono } from "hono";
import type { HomeWeatherSnapshot } from "@dashwise/types/sdk";

import { toPublicHomeServerSnapshot, type HomeServerSnapshot } from "./home-server-status";

export type MemoryReclaimResult = {
  reclaimedBytes: number;
  completedAt: string;
};

async function reclaimLinuxMemory(): Promise<MemoryReclaimResult> {
  const requestId = randomUUID();
  const stateRoot = "/var/lib/dashwise/memory-reclaim";
  await writeFile(`${stateRoot}/request`, `${requestId}\n`, { encoding: "utf8", mode: 0o640 });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const result = JSON.parse(await readFile(`${stateRoot}/result.json`, "utf8")) as Partial<MemoryReclaimResult> & {
        requestId?: string;
      };
      if (result.requestId === requestId) {
        if (!Number.isFinite(result.reclaimedBytes) || Number(result.reclaimedBytes) < 0
          || typeof result.completedAt !== "string") {
          throw new Error("Memory reclaim returned invalid data");
        }
        return {
          reclaimedBytes: Math.round(Number(result.reclaimedBytes)),
          completedAt: result.completedAt,
        };
      }
    } catch (error) {
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await Bun.sleep(150);
  }
  throw new Error("Memory reclaim timed out");
}

export function createHomeServerRoute(options: {
  authorize: (token: string | null) => Promise<void>;
  readStatus: () => Promise<HomeServerSnapshot>;
  readWeather?: () => Promise<HomeWeatherSnapshot>;
  reclaimMemory?: () => Promise<MemoryReclaimResult>;
}) {
  const route = new Hono();
  route.get("/api/v1/home-server/public-status", async (context) => {
    try {
      const snapshot = toPublicHomeServerSnapshot(await options.readStatus());
      context.header("Cache-Control", "public, max-age=5, stale-while-revalidate=15");
      return context.json(snapshot);
    } catch {
      context.header("Cache-Control", "no-store");
      return context.json({ error: "Status collection failed" }, 503);
    }
  });

  route.get("/api/v1/home-server/status", async (context) => {
    context.header("Cache-Control", "private, no-store");
    const authorization = context.req.header("Authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
    try {
      await options.authorize(token);
    } catch {
      return context.json({ error: "Unauthorized" }, 401);
    }

    try {
      return context.json(await options.readStatus());
    } catch {
      return context.json({ error: "Status collection failed" }, 503);
    }
  });

  route.get("/api/v1/home-server/weather", async (context) => {
    try {
      if (!options.readWeather) throw new Error("Weather is not configured");
      const weather = await options.readWeather();
      context.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      return context.json(weather);
    } catch {
      context.header("Cache-Control", "no-store");
      return context.json({ error: "Weather collection failed" }, 503);
    }
  });

  route.post("/api/v1/home-server/reclaim-memory", async (context) => {
    context.header("Cache-Control", "private, no-store");
    const authorization = context.req.header("Authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
    try {
      await options.authorize(token);
    } catch {
      return context.json({ error: "Unauthorized" }, 401);
    }

    try {
      return context.json(await (options.reclaimMemory || reclaimLinuxMemory)());
    } catch {
      return context.json({ error: "Memory reclaim failed" }, 503);
    }
  });
  return route;
}
