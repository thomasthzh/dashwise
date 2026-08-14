import { expect, test } from "bun:test";

import {
  formatBinaryBytes,
  resolveHomeServerCardHref,
  resolveHomeAccessStates,
  resolveOceanBackground,
  resolveTelemetryFreshness,
  shouldPlayOceanVideo,
} from "./homeServerPresentation";

test("defaults the ocean selector to lightweight background B", () => {
  expect(resolveOceanBackground(null)).toBe("b");
  expect(resolveOceanBackground("unknown")).toBe("b");
  expect(resolveOceanBackground("e")).toBe("e");
});

test("keeps the selected moving ocean active when reduced motion is preferred", () => {
  expect(shouldPlayOceanVideo({ pageVisible: true, prefersReducedMotion: true })).toBe(true);
  expect(shouldPlayOceanVideo({ pageVisible: false, prefersReducedMotion: true })).toBe(false);
});

test("formats binary host capacity values compactly", () => {
  expect(formatBinaryBytes(13_744_488_448)).toBe("12.8 GiB");
  expect(formatBinaryBytes(972_810_190_848)).toBe("906 GiB");
});

test("derives access badges from realtime service state without claiming unprobed IPv6", () => {
  const states = resolveHomeAccessStates([
    { id: "tailscale", state: "offline" },
    { id: "nps", state: "degraded" },
  ]);

  expect(states).toEqual({ tailscale: "offline", ipv6: "unknown", nps: "degraded" });
});

test("marks retained telemetry as stale after a refresh failure", () => {
  expect(resolveTelemetryFreshness({ hasData: true, isError: true })).toBe("stale");
  expect(resolveTelemetryFreshness({ hasData: true, isError: false })).toBe("live");
  expect(resolveTelemetryFreshness({ hasData: false, isError: true })).toBe("unavailable");
});

test("read-only service cards never become management links", () => {
  expect(resolveHomeServerCardHref("https://private.example.invalid", true)).toBeUndefined();
  expect(resolveHomeServerCardHref("https://private.example.invalid", false)).toBe("https://private.example.invalid");
});
