import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { getWidgetLoadTier } from "./widgetLoadPolicy";

test("keeps 126f home widget types in the core bundle", () => {
  const coreTypes = [
    "main-clock",
    "glanceable-clock",
    "search-bar",
    "progress",
    "day-progress",
    "week-progress",
    "month-progress",
    "year-progress",
    "shortcuts",
    "home-server-activity",
    "home-server-services",
    "home-server-host",
    "placeholder",
  ];

  for (const type of coreTypes) {
    expect(getWidgetLoadTier(type)).toBe("core");
  }
});

test("defers optional and generic widget implementations", () => {
  const deferredTypes = [
    "calendar-today",
    "calendar-week",
    "calendar-upcoming",
    "rss-feed",
    "latest-rss-feed",
    "latest-links",
    "countdown",
    "link-view",
    "iframe",
    "beszel#system",
  ];

  for (const type of deferredTypes) {
    expect(getWidgetLoadTier(type)).toBe("deferred");
  }
});

test("core widget entry has one lazy deferred boundary and no heavy imports", () => {
  const source = readFileSync(
    new URL("../components/widgets/Widget.tsx", import.meta.url),
    "utf8",
  );

  expect(source).toContain('lazy(() => import("./DeferredWidget"))');
  expect(source).not.toContain("@dashwise/integrationskit");
  expect(source).not.toContain('from "./LinkView"');
});
