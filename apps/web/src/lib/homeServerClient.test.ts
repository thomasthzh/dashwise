import { expect, test } from "bun:test";

import {
  fetchHomeWeather,
  fetchHomeServerStatus,
  fetchPublicHomeServerStatus,
  resolveHomeServerWidgetPolicy,
  shouldUsePrivateHomeServerStatus,
} from "./homeServerClient";

const host = {
  hostname: "126f",
  uptimeSeconds: 1,
  cpuPercent: 2,
  memoryPercent: 3,
  diskPercent: 4,
  load1: 0.1,
  memoryUsedBytes: 5,
  memoryTotalBytes: 6,
  diskUsedBytes: 7,
  diskTotalBytes: 8,
};

test("fetches the 126f status endpoint with the authenticated bearer token", async () => {
  let request: Request | undefined;
  const snapshot = {
    generatedAt: "now",
    host,
    hardware: {
      boardModel: "MS-7D99",
      temperatures: [],
      fans: [],
      swapUsedBytes: 0,
      swapTotalBytes: 0,
    },
    services: [],
  };
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
  expect(result.hardware?.boardModel).toBe("MS-7D99");
});

test("rejects an unavailable status endpoint", async () => {
  await expect(fetchHomeServerStatus({ token: "token" }, {
    baseUrl: "https://dashboard.example/",
    fetch: async () => Response.json({ error: "down" }, { status: 503 }),
  })).rejects.toThrow("down");
});

test("fetches the public status endpoint without transmitting authentication", async () => {
  let request: Request | undefined;
  let requestInit: RequestInit | undefined;
  const snapshot = { generatedAt: "now", host, services: [] };
  const result = await fetchPublicHomeServerStatus({
    baseUrl: "https://homepage.example/",
    fetch: async (input, init) => {
      requestInit = init;
      request = new Request(input, init);
      return Response.json(snapshot);
    },
  });

  expect(request?.url).toBe("https://homepage.example/api/v1/home-server/public-status");
  expect(request?.headers.get("Authorization")).toBeNull();
  expect(requestInit?.credentials).toBe("omit");
  expect(result).toEqual(snapshot);
});

test("read-only dashboards never select the private status client", () => {
  expect(shouldUsePrivateHomeServerStatus("stale-token", true)).toBe(false);
  expect(shouldUsePrivateHomeServerStatus("valid-token", false)).toBe(true);
  expect(shouldUsePrivateHomeServerStatus(null, false)).toBe(false);
});

test("fetches public dual-city weather without transmitting authentication", async () => {
  let request: Request | undefined;
  let requestInit: RequestInit | undefined;
  const weather = { generatedAt: "now", locations: [] };
  const result = await fetchHomeWeather({
    baseUrl: "https://homepage.example/",
    fetch: async (input, init) => {
      requestInit = init;
      request = new Request(input, init);
      return Response.json(weather);
    },
  });

  expect(request?.url).toBe("https://homepage.example/api/v1/home-server/weather");
  expect(request?.headers.get("Authorization")).toBeNull();
  expect(requestInit?.credentials).toBe("omit");
  expect(result).toEqual(weather);
});

test("anonymous widgets remain read-only even if a public response is poisoned", () => {
  expect(resolveHomeServerWidgetPolicy(null, false)).toEqual({
    usePrivateStatus: false,
    effectiveReadOnly: true,
  });
  expect(resolveHomeServerWidgetPolicy("valid-token", false)).toEqual({
    usePrivateStatus: true,
    effectiveReadOnly: false,
  });
});
