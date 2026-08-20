const LOCAL_ONLY_GLANCEABLES = new Set([
  "date",
  "greeting",
  "local-timezone",
  "world-clock",
  "progress",
  "day-progress",
  "week-progress",
  "month-progress",
  "year-progress",
  "latest-activities",
]);

export function shouldUseBackendGlanceable(type: string, readOnly = false) {
  return !readOnly && !LOCAL_ONLY_GLANCEABLES.has(type) && type !== "latest-activities";
}

export function shouldUseProtectedGlanceableCache(readOnly = false) {
  return !readOnly;
}

export function shouldUseLightweightGlanceable(type: string) {
  return LOCAL_ONLY_GLANCEABLES.has(type);
}
