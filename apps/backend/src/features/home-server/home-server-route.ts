import { Hono } from "hono";

import { toPublicHomeServerSnapshot, type HomeServerSnapshot } from "./home-server-status";

export type MemoryReclaimResult = {
  reclaimedBytes: number;
  completedAt: string;
};

async function reclaimLinuxMemory(): Promise<MemoryReclaimResult> {
  const child = Bun.spawn([
    "/usr/bin/sudo",
    "-n",
    "/usr/local/sbin/dashwise-reclaim-memory",
  ], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = setTimeout(() => child.kill(), 45_000);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(stderr.trim() || "Memory reclaim failed");
    }
    const result = JSON.parse(stdout) as Partial<MemoryReclaimResult>;
    if (!Number.isFinite(result.reclaimedBytes) || Number(result.reclaimedBytes) < 0
      || typeof result.completedAt !== "string") {
      throw new Error("Memory reclaim returned invalid data");
    }
    return {
      reclaimedBytes: Math.round(Number(result.reclaimedBytes)),
      completedAt: result.completedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createHomeServerRoute(options: {
  authorize: (token: string | null) => Promise<void>;
  readStatus: () => Promise<HomeServerSnapshot>;
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
