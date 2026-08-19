import type { HardwareTemperature, HomeServerSnapshot } from "./homeServerClient";

export type OceanBackgroundKey = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const OCEAN_BACKGROUND_KEYS = new Set<OceanBackgroundKey>(["a", "b", "c", "d", "e", "f", "g"]);
const EXACT_126F_BOARD_MODEL = "B760M GAMING PLUS WIFI DDR4 II (MS-7D99)";

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

type RealtimeState = "online" | "degraded" | "offline" | "unknown";

export function resolveHomeAccessStates(services: Array<{ id: string; state: RealtimeState }>) {
  const stateFor = (id: string): RealtimeState => services.find((service) => service.id === id)?.state ?? "unknown";

  return {
    tailscale: stateFor("tailscale"),
    ipv6: "unknown" as const,
    nps: stateFor("nps"),
  };
}

export function resolveTelemetryFreshness({
  hasData,
  isError,
}: {
  hasData: boolean;
  isError: boolean;
}) {
  if (!hasData) return "unavailable" as const;
  return isError ? "stale" as const : "live" as const;
}

export function resolveHomeServerCardHref(href: string | undefined, readOnly = false) {
  return readOnly ? undefined : href;
}

export function resolveResourcePressure(value: number) {
  if (value >= 85) return "high" as const;
  if (value >= 70) return "elevated" as const;
  return "normal" as const;
}

function hottest(sensors: HardwareTemperature[]) {
  return sensors.reduce<HardwareTemperature | undefined>(
    (selected, sensor) => !selected || sensor.celsius > selected.celsius ? sensor : selected,
    undefined,
  );
}

export function resolveHardwarePanel(snapshot: HomeServerSnapshot) {
  const hardware = snapshot.hardware;
  if (!hardware) return undefined;
  const sensors = hardware.temperatures;
  const fromSource = (pattern: RegExp) => sensors.filter((sensor) => pattern.test(sensor.source));
  const cpuSensors = fromSource(/^coretemp$/i);
  const cpu = cpuSensors.find((sensor) => /^package id 0$/i.test(sensor.label))
    ?? cpuSensors.find((sensor) => /package/i.test(sensor.label))
    ?? hottest(cpuSensors);
  const gpu = hottest(fromSource(/^(nouveau|amdgpu|nvidia)$/i));
  const boardSensors = fromSource(/^nct668[37]$/i);
  const board = boardSensors.find((sensor) => /^(system|motherboard|mainboard)$/i.test(sensor.label))
    ?? boardSensors.find((sensor) => /(system|motherboard|mainboard)/i.test(sensor.label))
    ?? hottest(fromSource(/^acpitz$/i));
  const nvmeSensors = fromSource(/^nvme$/i);
  const nvme = hottest(nvmeSensors.filter((sensor) => /^composite$/i.test(sensor.label)))
    ?? hottest(nvmeSensors);

  const temperature = (
    key: "cpu" | "gpu" | "board" | "nvme",
    label: string,
    sensor: HardwareTemperature | undefined,
  ) => ({ key, label, celsius: sensor?.celsius });

  return {
    ...(hardware.boardModel ? { boardModel: hardware.boardModel } : {}),
    temperatures: [
      temperature("cpu", "CPU", cpu),
      temperature("gpu", "GPU", gpu),
      temperature("board", "主板 / ACPI", board),
      temperature("nvme", "NVMe", nvme),
    ],
    fans: hardware.fans.filter((fan) => fan.rpm > 0).map((fan) => {
      const generic = fan.label.match(/^fan\s*(\d+)$/i);
      const label = generic && hardware.boardModel === EXACT_126F_BOARD_MODEL && fan.source === "nct6687"
        ? generic[1] === "1"
          ? "CPU 风扇"
          : generic[1] === "3"
            ? "机箱风扇 1"
            : `风扇 ${generic[1]}`
        : generic
          ? `风扇 ${generic[1]}`
          : fan.label;
      return {
        id: fan.id,
        label,
        rpm: fan.rpm,
      };
    }),
    swapUsedBytes: hardware.swapUsedBytes,
    swapTotalBytes: hardware.swapTotalBytes,
  };
}
