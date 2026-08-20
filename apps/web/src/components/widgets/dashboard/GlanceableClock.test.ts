import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  shouldUseBackendGlanceable,
  shouldUseLightweightGlanceable,
  shouldUseProtectedGlanceableCache,
} from "@/lib/glanceableAccess";

describe("public glanceable clock", () => {
  test("never calls protected glanceable integrations in read-only mode", () => {
    expect(shouldUseBackendGlanceable("weather", true)).toBe(false);
    expect(shouldUseBackendGlanceable("weather", false)).toBe(true);
    expect(shouldUseBackendGlanceable("date", false)).toBe(false);
    expect(shouldUseProtectedGlanceableCache(true)).toBe(false);
    expect(shouldUseProtectedGlanceableCache(false)).toBe(true);
  });

  test("keeps local clock glanceables on the lightweight path", () => {
    expect(shouldUseLightweightGlanceable("date")).toBe(true);
    expect(shouldUseLightweightGlanceable("day-progress")).toBe(true);
    expect(shouldUseLightweightGlanceable("weather")).toBe(false);
  });

  test("loads the generic integration renderer only through suspense", () => {
    const source = readFileSync(new URL("./GlanceableClock.tsx", import.meta.url), "utf8");

    expect(source).toContain('lazy(() => import("@dashwise/integrationskit/Glanceable"))');
    expect(source).not.toContain('import GlanceableComponent from "@dashwise/integrationskit/Glanceable"');
    expect(source).toContain("<LocalGlanceable");
  });
});
