export type OceanBackgroundKey = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const OCEAN_BACKGROUND_KEYS = new Set<OceanBackgroundKey>(["a", "b", "c", "d", "e", "f", "g"]);

export function resolveOceanBackground(saved: string | null): OceanBackgroundKey {
  const normalized = saved?.trim().toLowerCase() as OceanBackgroundKey | undefined;
  return normalized && OCEAN_BACKGROUND_KEYS.has(normalized) ? normalized : "b";
}

export function shouldPlayOceanVideo({
  pageVisible,
}: {
  pageVisible: boolean;
  prefersReducedMotion: boolean;
}) {
  return pageVisible;
}

export function formatBinaryBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const digits = value >= 100 || exponent === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[exponent]}`;
}
