import { expect, test } from "bun:test";

import { createHomeServerRoute } from "./home-server-route";

test("home server route requires a bearer token before returning status", async () => {
  let authorizationChecks = 0;
  const route = createHomeServerRoute({
    authorize: async (token) => {
      authorizationChecks += 1;
      if (token !== "valid-token") throw new Error("Unauthorized");
    },
    readStatus: async () => ({
      generatedAt: "now",
      host: {},
      services: [{
        id: "tailscale",
        origin: "126f",
        name: "Tailscale",
        icon: "simple-icons:tailscale",
        state: "online",
        metric: "2 peers",
        detail: "100.80.188.111",
        href: "http://100.80.188.111:3000",
      }],
    } as never),
  });

  const publicResponse = await route.request("http://localhost/api/v1/home-server/public-status");
  expect(publicResponse.status).toBe(200);
  expect(publicResponse.headers.get("Cache-Control")).toBe("public, max-age=5, stale-while-revalidate=15");
  expect(await publicResponse.json()).toMatchObject({
    services: [{ detail: "私有组网" }],
  });
  expect(authorizationChecks).toBe(0);

  const unauthorized = await route.request("http://localhost/api/v1/home-server/status");
  expect(unauthorized.status).toBe(401);
  expect(unauthorized.headers.get("Cache-Control")).toBe("private, no-store");

  const authorized = await route.request("http://localhost/api/v1/home-server/status", {
    headers: { Authorization: "Bearer valid-token" },
  });
  expect(authorized.status).toBe(200);
  expect(await authorized.json()).toMatchObject({
    services: [{ href: "http://100.80.188.111:3000", detail: "100.80.188.111" }],
  });
  expect(authorizationChecks).toBe(2);
});

test("failed public telemetry responses cannot be cached", async () => {
  const route = createHomeServerRoute({
    authorize: async () => {},
    readStatus: async () => {
      throw new Error("probe failure");
    },
  });

  const response = await route.request("http://localhost/api/v1/home-server/public-status");
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
