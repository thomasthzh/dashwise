import { describe, expect, test } from "bun:test";

import {
  readLinuxHardwareTelemetry,
  type HardwareFs,
} from "./home-server-hardware";

function memoryHardwareFs(
  files: Record<string, string>,
  realpaths: Record<string, string> = {},
): HardwareFs {
  return {
    list: async (path) => {
      const prefix = `${path.replace(/\/$/, "")}/`;
      const entries = new Set<string>();
      for (const filename of Object.keys(files)) {
        if (!filename.startsWith(prefix)) continue;
        const remainder = filename.slice(prefix.length);
        if (remainder) entries.add(remainder.split("/")[0]);
      }
      if (entries.size === 0) throw new Error(`missing directory: ${path}`);
      return [...entries];
    },
    read: async (path) => {
      if (!(path in files)) throw new Error(`missing file: ${path}`);
      return files[path];
    },
    realpath: async (path) => realpaths[path] ?? path,
  };
}

describe("Linux hardware telemetry", () => {
  test("reads valid temperatures, fan RPM, board model, and swap usage", async () => {
    const fs = memoryHardwareFs({
      "/sys/class/hwmon/hwmon0/name": "acpitz\n",
      "/sys/class/hwmon/hwmon0/temp1_input": "27800\n",
      "/sys/class/hwmon/hwmon1/name": "nvme\n",
      "/sys/class/hwmon/hwmon1/temp1_label": "Composite\n",
      "/sys/class/hwmon/hwmon1/temp1_input": "46850\n",
      "/sys/class/hwmon/hwmon3/name": "coretemp\n",
      "/sys/class/hwmon/hwmon3/temp1_label": "Package id 0\n",
      "/sys/class/hwmon/hwmon3/temp1_input": "26000\n",
      "/sys/class/hwmon/hwmon4/name": "nouveau\n",
      "/sys/class/hwmon/hwmon4/temp1_input": "28000\n",
      "/sys/class/hwmon/hwmon5/name": "nct6687\n",
      "/sys/class/hwmon/hwmon5/fan1_input": "1264\n",
      "/proc/meminfo": "MemTotal:       32653568 kB\nSwapTotal:      33554432 kB\nSwapFree:       32964608 kB\n",
      "/sys/class/dmi/id/board_name": "B760M GAMING PLUS WIFI DDR4 II (MS-7D99)\n",
    }, {
      "/sys/class/hwmon/hwmon0/device": "/sys/devices/LNXSYSTM:00/acpitz",
      "/sys/class/hwmon/hwmon1/device": "/sys/devices/pci0000:00/0000:02:00.0/nvme/nvme0",
      "/sys/class/hwmon/hwmon3/device": "/sys/devices/platform/coretemp.0",
      "/sys/class/hwmon/hwmon4/device": "/sys/devices/pci0000:00/0000:01:00.0",
      "/sys/class/hwmon/hwmon5/device": "/sys/devices/platform/nct6683.2592",
    });

    const result = await readLinuxHardwareTelemetry(fs);

    expect(result).toEqual({
      boardModel: "B760M GAMING PLUS WIFI DDR4 II (MS-7D99)",
      temperatures: [
        { id: "acpitz:/sys/devices/LNXSYSTM:00/acpitz:temp1", source: "acpitz", label: "Temp 1", celsius: 27.8 },
        { id: "coretemp:/sys/devices/platform/coretemp.0:temp1", source: "coretemp", label: "Package id 0", celsius: 26 },
        { id: "nouveau:/sys/devices/pci0000:00/0000:01:00.0:temp1", source: "nouveau", label: "Temp 1", celsius: 28 },
        { id: "nvme:/sys/devices/pci0000:00/0000:02:00.0/nvme/nvme0:temp1", source: "nvme", label: "Composite", celsius: 46.9 },
      ],
      fans: [
        { id: "nct6687:/sys/devices/platform/nct6683.2592:fan1", source: "nct6687", label: "Fan 1", rpm: 1264 },
      ],
      swapUsedBytes: 603_979_776,
      swapTotalBytes: 34_359_738_368,
    });
  });

  test("drops malformed and implausible inputs without failing the sample", async () => {
    const fs = memoryHardwareFs({
      "/sys/class/hwmon/hwmon0/name": "coretemp\n",
      "/sys/class/hwmon/hwmon0/temp1_input": "151000\n",
      "/sys/class/hwmon/hwmon0/temp2_input": "not-a-number\n",
      "/sys/class/hwmon/hwmon0/temp3_input": "-51000\n",
      "/sys/class/hwmon/hwmon0/fan1_input": "-1\n",
      "/sys/class/hwmon/hwmon0/fan2_input": "100001\n",
      "/sys/class/hwmon/hwmon0/fan3_input": "12.5\n",
      "/sys/class/hwmon/hwmon1/temp1_input": "42000\n",
      "/proc/meminfo": "SwapTotal: invalid\nSwapFree: 5 kB\n",
    });

    await expect(readLinuxHardwareTelemetry(fs)).resolves.toEqual({
      temperatures: [],
      fans: [],
      swapUsedBytes: 0,
      swapTotalBytes: 0,
    });
  });

  test("keeps sensor IDs stable when Linux renumbers hwmon directories", async () => {
    const first = memoryHardwareFs({
      "/sys/class/hwmon/hwmon2/name": "coretemp\n",
      "/sys/class/hwmon/hwmon2/temp1_label": "Package id 0\n",
      "/sys/class/hwmon/hwmon2/temp1_input": "26000\n",
    }, {
      "/sys/class/hwmon/hwmon2/device": "/sys/devices/platform/coretemp.0",
    });
    const second = memoryHardwareFs({
      "/sys/class/hwmon/hwmon9/name": "coretemp\n",
      "/sys/class/hwmon/hwmon9/temp1_label": "Package id 0\n",
      "/sys/class/hwmon/hwmon9/temp1_input": "26000\n",
    }, {
      "/sys/class/hwmon/hwmon9/device": "/sys/devices/platform/coretemp.0",
    });

    const [firstResult, secondResult] = await Promise.all([
      readLinuxHardwareTelemetry(first),
      readLinuxHardwareTelemetry(second),
    ]);

    expect(firstResult.temperatures[0]?.id).toBe(secondResult.temperatures[0]?.id);
  });

  test("orders numbered fan inputs naturally", async () => {
    const fs = memoryHardwareFs({
      "/sys/class/hwmon/hwmon0/name": "nct6687\n",
      "/sys/class/hwmon/hwmon0/fan10_input": "1000\n",
      "/sys/class/hwmon/hwmon0/fan2_input": "200\n",
      "/sys/class/hwmon/hwmon0/fan1_input": "100\n",
    }, {
      "/sys/class/hwmon/hwmon0/device": "/sys/devices/platform/nct6683.2592",
    });

    const result = await readLinuxHardwareTelemetry(fs);

    expect(result.fans.map((fan) => fan.label)).toEqual(["Fan 1", "Fan 2", "Fan 10"]);
  });
});
