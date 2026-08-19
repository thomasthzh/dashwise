import { readdir, readFile, realpath } from "node:fs/promises";
import type {
  HardwareFan,
  HardwareTelemetry,
  HardwareTemperature,
} from "@dashwise/api-types";

export type { HardwareFan, HardwareTelemetry, HardwareTemperature } from "@dashwise/api-types";

export type HardwareFs = {
  list: (path: string) => Promise<string[]>;
  read: (path: string) => Promise<string>;
  realpath: (path: string) => Promise<string>;
};

const defaultHardwareFs: HardwareFs = {
  list: (path) => readdir(path),
  read: (path) => readFile(path, "utf8"),
  realpath,
};

async function optionalRead(fs: HardwareFs, path: string) {
  try {
    const value = (await fs.read(path)).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function optionalList(fs: HardwareFs, path: string) {
  try {
    return await fs.list(path);
  } catch {
    return [];
  }
}

async function optionalRealpath(fs: HardwareFs, path: string) {
  try {
    return await fs.realpath(path);
  } catch {
    return undefined;
  }
}

function numericReading(value: string | undefined, minimum: number, maximum: number) {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

function integerReading(value: string | undefined, minimum: number, maximum: number) {
  if (!value || !/^-?\d+$/.test(value)) return undefined;
  return numericReading(value, minimum, maximum);
}

function safeLabel(value: string | undefined, fallback: string) {
  return (value || fallback).replace(/\s+/g, " ").slice(0, 80);
}

function parseSwap(meminfo: string | undefined) {
  if (!meminfo) return { swapUsedBytes: 0, swapTotalBytes: 0 };
  const totalKiB = numericReading(meminfo.match(/^SwapTotal:\s+(\d+)\s+kB$/m)?.[1], 0, Number.MAX_SAFE_INTEGER);
  const freeKiB = numericReading(meminfo.match(/^SwapFree:\s+(\d+)\s+kB$/m)?.[1], 0, Number.MAX_SAFE_INTEGER);
  if (totalKiB == null || freeKiB == null || freeKiB > totalKiB) {
    return { swapUsedBytes: 0, swapTotalBytes: 0 };
  }
  return {
    swapUsedBytes: (totalKiB - freeKiB) * 1024,
    swapTotalBytes: totalKiB * 1024,
  };
}

async function stableDevicePath(fs: HardwareFs, base: string, source: string) {
  const devicePath = await optionalRealpath(fs, `${base}/device`);
  if (devicePath) return devicePath;
  const hwmonPath = await optionalRealpath(fs, base);
  if (!hwmonPath) return source;
  return hwmonPath.replace(/\/hwmon\/hwmon\d+$/, "").replace(/\/hwmon\d+$/, "");
}

export async function readLinuxHardwareTelemetry(
  fs: HardwareFs = defaultHardwareFs,
): Promise<HardwareTelemetry> {
  const temperatures: HardwareTemperature[] = [];
  const fans: HardwareFan[] = [];
  const hwmonRoot = "/sys/class/hwmon";
  const directories = (await optionalList(fs, hwmonRoot))
    .filter((entry) => /^hwmon\d+$/.test(entry))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  for (const directory of directories) {
    const base = `${hwmonRoot}/${directory}`;
    const rawSource = await optionalRead(fs, `${base}/name`);
    const source = rawSource?.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    if (!source) continue;
    const stablePath = await stableDevicePath(fs, base, source);
    const files = await optionalList(fs, base);

    for (const filename of files.sort()) {
      const temperatureMatch = filename.match(/^temp(\d+)_input$/);
      if (temperatureMatch) {
        const millidegrees = numericReading(
          await optionalRead(fs, `${base}/${filename}`),
          -50_000,
          150_000,
        );
        if (millidegrees == null) continue;
        const index = temperatureMatch[1];
        temperatures.push({
          id: `${source}:${stablePath}:temp${index}`,
          source,
          label: safeLabel(await optionalRead(fs, `${base}/temp${index}_label`), `Temp ${index}`),
          celsius: Math.round(millidegrees / 100) / 10,
        });
        continue;
      }

      const fanMatch = filename.match(/^fan(\d+)_input$/);
      if (!fanMatch) continue;
      const rawRpm = integerReading(
        await optionalRead(fs, `${base}/${filename}`),
        0,
        100_000,
      );
      if (rawRpm == null) continue;
      const index = fanMatch[1];
      fans.push({
        id: `${source}:${stablePath}:fan${index}`,
        source,
        label: safeLabel(await optionalRead(fs, `${base}/fan${index}_label`), `Fan ${index}`),
        rpm: Math.round(rawRpm),
      });
    }
  }

  const boardModel = (await optionalRead(fs, "/sys/class/dmi/id/board_name"))?.slice(0, 120);
  const swap = parseSwap(await optionalRead(fs, "/proc/meminfo"));
  temperatures.sort((left, right) => left.id.localeCompare(right.id));
  fans.sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));

  return {
    ...(boardModel ? { boardModel } : {}),
    temperatures,
    fans,
    ...swap,
  };
}
