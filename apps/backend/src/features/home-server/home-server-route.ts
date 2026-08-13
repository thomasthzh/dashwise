import { Hono } from "hono";

import type { HomeServerSnapshot } from "./home-server-status";

export function createHomeServerRoute(options: {
  authorize: (token: string | null) => Promise<void>;
  readStatus: () => Promise<HomeServerSnapshot>;
}) {
  const route = new Hono();
  route.get("/api/v1/home-server/status", async (context) => {
    const authorization = context.req.header("Authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
    try {
      await options.authorize(token);
    } catch {
      return context.json({ error: "Unauthorized" }, 401);
    }

    try {
      context.header("Cache-Control", "private, no-store");
      return context.json(await options.readStatus());
    } catch {
      return context.json({ error: "Status collection failed" }, 503);
    }
  });
  return route;
}
