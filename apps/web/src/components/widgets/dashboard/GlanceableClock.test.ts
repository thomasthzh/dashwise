import { describe, expect, test } from "bun:test";

import { shouldUseBackendGlanceable, shouldUseProtectedGlanceableCache } from "@/lib/glanceableAccess";

describe("public glanceable clock", () => {
  test("never calls protected glanceable integrations in read-only mode", () => {
    expect(shouldUseBackendGlanceable("weather", true)).toBe(false);
    expect(shouldUseBackendGlanceable("weather", false)).toBe(true);
    expect(shouldUseBackendGlanceable("date", false)).toBe(false);
    expect(shouldUseProtectedGlanceableCache(true)).toBe(false);
    expect(shouldUseProtectedGlanceableCache(false)).toBe(true);
  });
});
