import { expect, test } from "bun:test";

import { createHomeServerRoute } from "./home-server-route";

test("home server route requires a bearer token before returning status", async () => {
  const route = createHomeServerRoute({
    authorize: async (token) => {
      if (token !== "valid-token") throw new Error("Unauthorized");
    },
    readStatus: async () => ({ generatedAt: "now", host: {}, services: [] } as never),
  });

  const unauthorized = await route.request("http://localhost/api/v1/home-server/status");
  expect(unauthorized.status).toBe(401);

  const authorized = await route.request("http://localhost/api/v1/home-server/status", {
    headers: { Authorization: "Bearer valid-token" },
  });
  expect(authorized.status).toBe(200);
  expect(await authorized.json()).toEqual({ generatedAt: "now", host: {}, services: [] });
});
