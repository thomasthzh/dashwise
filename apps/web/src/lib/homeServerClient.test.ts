import { expect, test } from "bun:test";

import { fetchHomeServerStatus } from "./homeServerClient";

test("fetches the 126f status endpoint with the authenticated bearer token", async () => {
  let request: Request | undefined;
  const snapshot = { generatedAt: "now", host: {}, services: [] };
  const result = await fetchHomeServerStatus({ token: "secret-token" }, {
    baseUrl: "https://dashboard.example/",
    fetch: async (input, init) => {
      request = new Request(input, init);
      return Response.json(snapshot);
    },
  });

  expect(request?.url).toBe("https://dashboard.example/api/v1/home-server/status");
  expect(request?.headers.get("Authorization")).toBe("Bearer secret-token");
  expect(result).toEqual(snapshot);
});

test("rejects an unavailable status endpoint", async () => {
  await expect(fetchHomeServerStatus({ token: "token" }, {
    baseUrl: "https://dashboard.example/",
    fetch: async () => Response.json({ error: "down" }, { status: 503 }),
  })).rejects.toThrow("down");
});
