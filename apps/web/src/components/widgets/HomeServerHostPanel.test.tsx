import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { HomeServerSnapshot } from "@/lib/homeServerClient";
import HomeServerHostPanel from "./HomeServerHostPanel";

const snapshot: HomeServerSnapshot = {
  generatedAt: "2026-08-19T04:00:00.000Z",
  host: {
    hostname: "ZHOU12600kf",
    uptimeSeconds: 100,
    cpuPercent: 3,
    memoryPercent: 48,
    diskPercent: 6,
    load1: 0.11,
    memoryUsedBytes: 16_123_355_136,
    memoryTotalBytes: 33_437_224_960,
    diskUsedBytes: 51_020_312_576,
    diskTotalBytes: 972_371_521_536,
  },
  hardware: {
    boardModel: "B760M GAMING PLUS WIFI DDR4 II (MS-7D99)",
    temperatures: [
      { id: "cpu", source: "coretemp", label: "Package id 0", celsius: 26 },
      { id: "gpu", source: "nouveau", label: "Temp 1", celsius: 28 },
      { id: "board", source: "acpitz", label: "Temp 1", celsius: 27.8 },
      { id: "nvme", source: "nvme", label: "Composite", celsius: 46.9 },
    ],
    fans: [
      { id: "fan-1", source: "nct6687", label: "Fan 1", rpm: 1264 },
      { id: "fan-2", source: "nct6687", label: "Fan 2", rpm: 0 },
      { id: "fan-3", source: "nct6687", label: "Fan 3", rpm: 980 },
    ],
    swapUsedBytes: 603_979_776,
    swapTotalBytes: 34_359_738_368,
  },
  services: [
    { id: "tailscale", origin: "126f", name: "Tailscale", icon: "simple-icons:tailscale", state: "online", metric: "4 peers", detail: "Tailnet" },
    { id: "nps", origin: "126f", name: "NPS", icon: "fa6-solid:network-wired", state: "online", metric: "Client online", detail: "fallback" },
    { id: "hkvps", origin: "hkvps", name: "hkvps", icon: "fa6-solid:server", state: "online", metric: "2% CPU · 18% RAM", detail: "36 ms · Tailscale direct" },
  ],
};

test("renders the approved integrated hardware panel for administrators", () => {
  const markup = renderToStaticMarkup(
    <HomeServerHostPanel snapshot={snapshot} stale={false} readOnly={false} />,
  );

  expect(markup).toContain("硬件状态");
  expect(markup).toContain("B760M GAMING PLUS WIFI DDR4 II (MS-7D99)");
  expect(markup).toContain("Debian · CPU 26.0°C · GPU 28.0°C");
  expect(markup).toContain("CPU");
  expect(markup).toContain("GPU");
  expect(markup).toContain("主板 / ACPI");
  expect(markup).toContain("NVMe");
  expect(markup).toContain("1264 RPM");
  expect(markup).toContain("CPU 风扇");
  expect(markup).toContain("机箱风扇 1");
  expect(markup).not.toContain(">0 RPM<");
  expect(markup).not.toContain(">风扇 2<");
  expect(markup).toContain("交换空间");
  expect(markup).toContain("内存");
  expect(markup).toContain("根存储");
  expect(markup).toContain("2% CPU · 18% RAM");
  expect(markup).toContain("36 ms · Tailscale direct");
});

test("keeps the anonymous host card compact even if private data is accidentally supplied", () => {
  const markup = renderToStaticMarkup(
    <HomeServerHostPanel snapshot={snapshot} stale={false} readOnly />,
  );

  expect(markup).not.toContain("硬件状态");
  expect(markup).not.toContain("B760M GAMING PLUS WIFI DDR4 II (MS-7D99)");
  expect(markup).not.toContain("1264 RPM");
  expect(markup).not.toContain("交换空间");
  expect(markup).toContain("RAM");
  expect(markup).toContain("Disk");
});

test("states the exact limitation when the kernel exposes no fan inputs", () => {
  const markup = renderToStaticMarkup(
    <HomeServerHostPanel
      snapshot={{ ...snapshot, hardware: { ...snapshot.hardware!, fans: [] } }}
      stale
      readOnly={false}
    />,
  );

  expect(markup).toContain("未检测到转速信号");
  expect(markup).toContain("陈旧");
  expect(markup).not.toContain("0 RPM");
});
