# 126f Private Hardware Panel Design

**Date:** 2026-08-19

**Status:** Approved

**Visual direction:** “B · right-side integrated” approved by the user

## Objective

Upgrade the existing right-side 126f host card into a single administrator-only hardware panel. It must combine live temperatures and fan RPM with every resource and remote-host indicator already present in that card, while preserving Dashwise's optical liquid-glass style and cyan/green luminous progress bars.

The same work also delivers a concise Chinese NetAlertX operating guide for the user's Dongguan LAN.

## Confirmed requirements

- Keep the panel in the existing right-column host-card position; do not add hardware cards to the service matrix.
- Order the information as temperature, fan speed, resource usage, then the existing hkvps peer status.
- Show CPU package, GPU, board/ACPI, and NVMe temperature.
- Show every fan RPM the operating system can identify. Never invent a zero or a connector name that sysfs does not prove.
- Preserve CPU usage/load, memory usage, root storage usage, and the existing hkvps state.
- Add swap usage beneath memory.
- Preserve the current luminous cyan-to-green utilization bars; the memory bar retains a restrained breathing glow and honors reduced-motion preferences.
- Hardware details are visible only after a valid administrator login. The anonymous page and public API must contain no hardware telemetry.
- Refresh through the existing ten-second dashboard status cadence.

## Host facts and collection route

The target reports `B760M GAMING PLUS WIFI DDR4 II (MS-7D99)`, an Intel Core i5-12600KF, and an NVIDIA GT 1030 using `nouveau`. Existing hwmon sources expose `coretemp`, `nouveau`, `nvme`, and `acpitz` temperatures. No `fan*_input` files are currently present because the in-tree `nct6683` module is not loaded.

MSI documents fan-speed detection on the board family, and the Linux `nct6683` driver supports the Nuvoton NCT6687D. Deployment will first test the distribution-supplied module without a `force` parameter. The application will read RPM only; it will never write `pwm*`, limits, curves, or firmware settings.

References:

- [MSI B760M GAMING PLUS WIFI DDR4 II](https://www.msi.com/Motherboard/B760M-GAMING-PLUS-WIFI-DDR4-II)
- [Linux nct6683 hwmon driver](https://www.kernel.org/doc/html/latest/hwmon/nct6683.html)

## Data model

The private `HomeServerSnapshot` gains an optional `hardware` field:

```ts
type HardwareTelemetry = {
  boardModel?: string;
  temperatures: Array<{
    id: string;
    source: string;
    label: string;
    celsius: number;
  }>;
  fans: Array<{
    id: string;
    source: string;
    label: string;
    rpm: number;
  }>;
  swapUsedBytes: number;
  swapTotalBytes: number;
};
```

The collector reads `/sys/class/hwmon`, `/sys/class/dmi/id/board_name`, and `/proc/meminfo` directly through injected filesystem dependencies. It does not execute `sensors`, depend on locale-sensitive output, or add a package dependency.

Rules:

- Ignore missing, unreadable, empty, non-finite, negative, or physically implausible values.
- Convert hwmon millidegrees to one-decimal Celsius and accept fan RPM only as non-negative finite integers.
- Use stable IDs derived from hwmon source and attribute name, never transient `hwmonN` directory numbers alone.
- Preserve every valid sensor in the private payload so presentation can choose summaries without recollecting.
- A failed sensor source produces an empty subset, not a failed home-server snapshot.

## Presentation

For an authenticated snapshot with `hardware`:

1. Header: 126f, Debian, board/CPU/GPU summary, live/stale state.
2. Temperature grid: CPU Package, GPU, Board/ACPI, NVMe. Prefer labelled package/composite/system inputs; fall back conservatively. Missing values display `未检测`.
3. Fan list: up to the detected fan inputs in stable order. Use a driver-provided label when available; otherwise use `风扇 1`, `风扇 2`, and so on. An empty list displays `未检测到转速信号`.
4. Resource bars: CPU and load, RAM used/total, swap used/total, and root storage used/total.
5. Existing hkvps peer row and latency/connection detail.

Anonymous/read-only rendering continues to use the current compact CPU/RAM/Disk host panel. This avoids revealing hardware data and avoids leaving an empty private-only shell on the public dashboard.

The private card is responsive: two-column temperature tiles collapse to one column only when required, resource labels remain legible, and the page may scroll naturally rather than clipping data. Motion is disabled under `prefers-reduced-motion: reduce`.

## Privacy and API boundary

- The authenticated `/api/v1/home-server/status` endpoint may return `hardware` and remains `Cache-Control: private, no-store`.
- `toPublicHomeServerSnapshot` constructs its response field by field and does not include `hardware`.
- The public endpoint continues to use credential omission on the client.
- Tests assert both structural omission and serialized absence of board names, temperature labels, fan labels, and RPM values.
- Hardware collection failures are not returned as internal paths or raw errors.

## Fan enablement and rollback

Deployment performs these bounded steps:

1. Record the current module and hwmon state.
2. Load the distribution-provided `nct6683` module without parameters.
3. Verify that the module identifies a supported device and that readings are finite and plausible.
4. If successful, add one narrowly scoped modules-load entry so the driver returns after reboot.
5. If probing fails or produces implausible data, unload only the module loaded by this operation and leave persistent configuration unchanged.

No third-party kernel module, forced customer ID, PWM control, fan curve, BIOS setting, or public network rule is part of this work.

## NetAlertX guide

Create a short Chinese guide based on the current official NetAlertX documentation. It will teach the user's actual workflow rather than every setting:

1. Open the Tailnet-only NetAlertX URL and understand the Devices view.
2. Interpret New, Present, Down/Offline, Archived, IP, MAC, vendor, and last-seen fields.
3. Rename and classify trusted devices.
4. Investigate an unknown device without immediately blocking it.
5. Understand the boundary: NetAlertX discovers and alerts; the router performs DHCP reservation, blocking, and access-control changes.
6. Follow a five-minute routine for new-device review and false-positive cleanup.

The guide must not contain credentials and must not imply that an offline device is necessarily broken.

## Error handling

- Retain last-good status under a refresh failure and mark the card stale, using the existing freshness behavior.
- A private hardware collector failure leaves legacy host metrics available and labels only the unavailable sensor groups.
- A missing tach signal is `未检测` or `未连接`, not `0 RPM`, unless the kernel explicitly reports a present input at zero.
- Values beyond conservative validity bounds are dropped rather than rendered.

## Verification

Automated coverage:

- Pure collector tests for valid, missing, malformed, out-of-range, and renumbered hwmon inputs.
- Snapshot tests proving private inclusion and public omission.
- Client/presentation tests for temperature selection, fan fallback labels, byte formatting, stale state, and read-only behavior.
- Render-level assertions for the authenticated integrated panel and anonymous compact panel.
- Focused lint, typecheck, unit tests, and production build.

Live acceptance on 126f:

- Private endpoint returns plausible hardware readings and `private, no-store`.
- Public endpoint contains no `hardware` field or sensor-derived strings.
- At least the already-known CPU, GPU, board/ACPI, and NVMe temperatures render after login.
- Fan RPM renders when the upstream driver and tach wiring expose it; otherwise the UI states the precise limitation.
- CPU/RAM/swap/disk bars and hkvps row remain visible in the upgraded card.
- Public homepage, authenticated homepage, NetAlertX, and existing services remain healthy after deployment.
