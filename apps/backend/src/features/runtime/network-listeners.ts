export function resolvePocketBaseListenAddress(value?: string) {
  return value?.trim() || "127.0.0.1:8090";
}

export function resolveDashboardListenHost(value?: string) {
  return value?.trim() || "0.0.0.0";
}
