export type WidgetLoadTier = "core" | "deferred";

const CORE_WIDGET_TYPES = new Set([
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
]);

export function getWidgetLoadTier(type: string): WidgetLoadTier {
  return CORE_WIDGET_TYPES.has(type) ? "core" : "deferred";
}
