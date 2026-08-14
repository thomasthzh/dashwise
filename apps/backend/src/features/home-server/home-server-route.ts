import { Hono } from "hono";

import { toPublicHomeServerSnapshot, type HomeServerSnapshot } from "./home-server-status";

export function createHomeServerRoute(options: {
  authorize: (token: string | null) => Promise<void>;
  readStatus: () => Promise<HomeServerSnapshot>;
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
  return route;
}
