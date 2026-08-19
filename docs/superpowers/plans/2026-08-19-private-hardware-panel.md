# Private Hardware Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an administrator-only 126f hardware panel that combines real sensor readings, fan RPM, swap, existing CPU/RAM/disk usage, and hkvps status without exposing sensor data publicly.

**Architecture:** A focused Linux hwmon reader returns a typed `HardwareTelemetry` value through the existing injectable runtime. The private snapshot carries that value while the public DTO is constructed without it. A pure presentation helper selects summary temperatures and labels fan inputs, and a focused React host-panel component renders either the private integrated panel or the existing compact public panel.

**Tech Stack:** Bun, TypeScript, Hono, React 19, React DOM server tests, CSS, Linux sysfs/procfs

---

## File map

- Create `apps/backend/src/features/home-server/home-server-hardware.ts`: bounded Linux sysfs/procfs collector and parsing rules.
- Create `apps/backend/src/features/home-server/home-server-hardware.test.ts`: collector behavior with an in-memory file adapter.
- Modify `apps/backend/src/features/home-server/home-server-status.ts`: private hardware types, runtime hook, telemetry collection, and explicit public omission.
- Modify `apps/backend/src/features/home-server/home-server-status.test.ts`: private inclusion and serialized public privacy assertions.
- Modify `apps/backend/src/features/home-server/home-server-runtime.ts`: expose the production hardware collector through existing runtime dependencies.
- Modify `apps/backend/src/features/home-server/home-server-runtime.test.ts`: injectable runtime wiring and default-method coverage.
- Modify `apps/backend/src/features/home-server/home-server-service.test.ts`: update complete telemetry fixture.
- Modify `apps/web/src/lib/homeServerClient.ts`: mirror the optional private hardware contract.
- Modify `apps/web/src/lib/homeServerClient.test.ts`: prove private decoding and credential-free public request remain intact.
- Modify `apps/web/src/lib/homeServerPresentation.ts`: choose CPU/GPU/board/NVMe summaries and safe fan labels.
- Modify `apps/web/src/lib/homeServerPresentation.test.ts`: summary selection, missing data, and fan fallback tests.
- Create `apps/web/src/components/widgets/HomeServerHostPanel.tsx`: pure compact/private host panel renderer.
- Create `apps/web/src/components/widgets/HomeServerHostPanel.test.tsx`: static-markup boundary and content tests.
- Modify `apps/web/src/components/widgets/HomeServerWidget.tsx`: delegate the host variant to the focused component.
- Modify `apps/web/src/app/globals.css`: integrated glass layout, temperature tiles, fan rows, luminous resource bars, and reduced-motion rule.

### Task 1: Linux hardware collector

**Files:**
- Create: `apps/backend/src/features/home-server/home-server-hardware.ts`
- Create: `apps/backend/src/features/home-server/home-server-hardware.test.ts`

- [ ] **Step 1: Write failing collector tests**

Define a memory-backed adapter and assert exact typed output from representative `coretemp`, `nouveau`, `nvme`, `acpitz`, and `nct6687` files:

```ts
const files = {
  "/sys/class/hwmon/hwmon3/name": "coretemp\n",
  "/sys/class/hwmon/hwmon3/temp1_label": "Package id 0\n",
  "/sys/class/hwmon/hwmon3/temp1_input": "26000\n",
  "/sys/class/hwmon/hwmon5/name": "nct6687\n",
  "/sys/class/hwmon/hwmon5/fan1_input": "1264\n",
  "/proc/meminfo": "SwapTotal:       33554432 kB\nSwapFree:        32964608 kB\n",
  "/sys/class/dmi/id/board_name": "B760M GAMING PLUS WIFI DDR4 II (MS-7D99)\n",
};

expect(await readLinuxHardwareTelemetry(memoryHardwareFs(files))).toMatchObject({
  boardModel: "B760M GAMING PLUS WIFI DDR4 II (MS-7D99)",
  temperatures: [{ source: "coretemp", label: "Package id 0", celsius: 26 }],
  fans: [{ source: "nct6687", label: "Fan 1", rpm: 1264 }],
  swapUsedBytes: 603_979_776,
  swapTotalBytes: 34_359_738_368,
});
```

Add cases proving empty files, `NaN`, negative RPM, temperatures below -50°C or above 150°C, and unreadable hwmon directories are ignored without rejecting the whole sample.

- [ ] **Step 2: Run the focused test and verify red**

Run: `bun test apps/backend/src/features/home-server/home-server-hardware.test.ts`

Expected: FAIL because the module and exported collector do not exist.

- [ ] **Step 3: Implement the smallest collector**

Expose the typed contract and an injectable filesystem boundary:

```ts
export type HardwareTelemetry = {
  boardModel?: string;
  temperatures: HardwareTemperature[];
  fans: HardwareFan[];
  swapUsedBytes: number;
  swapTotalBytes: number;
};

export type HardwareFs = {
  list: (path: string) => Promise<string[]>;
  read: (path: string) => Promise<string>;
  realpath: (path: string) => Promise<string>;
};

export async function readLinuxHardwareTelemetry(
  fs: HardwareFs = defaultHardwareFs,
): Promise<HardwareTelemetry>;
```

Enumerate only `hwmon*` directories and only `temp*_input`, `temp*_label`, `fan*_input`, and `fan*_label` attributes. Use the real device path plus driver name and attribute as the ID; default an absent fan label to `Fan N`. Parse `/proc/meminfo` in KiB and use `SwapTotal - SwapFree`.

- [ ] **Step 4: Run the focused test and verify green**

Run: `bun test apps/backend/src/features/home-server/home-server-hardware.test.ts`

Expected: all collector tests PASS.

- [ ] **Step 5: Commit the collector**

```bash
git add apps/backend/src/features/home-server/home-server-hardware.ts apps/backend/src/features/home-server/home-server-hardware.test.ts
git commit -m "feat: collect private hardware sensors"
```

### Task 2: Private snapshot integration and public omission

**Files:**
- Modify: `apps/backend/src/features/home-server/home-server-status.ts`
- Modify: `apps/backend/src/features/home-server/home-server-status.test.ts`
- Modify: `apps/backend/src/features/home-server/home-server-service.test.ts`

- [ ] **Step 1: Add failing snapshot privacy tests**

Extend the shared telemetry fixture with a unique board name, temperature label, fan label, and RPM. Assert private propagation and public absence:

```ts
expect(buildHomeServerSnapshot(telemetry, {}).hardware).toEqual(telemetry.hardware);

const publicSnapshot = toPublicHomeServerSnapshot(buildHomeServerSnapshot(telemetry, {}));
expect(publicSnapshot).not.toHaveProperty("hardware");
const serialized = JSON.stringify(publicSnapshot);
expect(serialized).not.toContain("PRIVATE-MS-7D99");
expect(serialized).not.toContain("PRIVATE-CPU-SENSOR");
expect(serialized).not.toContain("PRIVATE-CPU-FAN");
expect(serialized).not.toContain("1264");
```

Add `readHardware` to the runtime test double and assert `collectHomeServerTelemetry` includes the result.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `bun test apps/backend/src/features/home-server/home-server-status.test.ts apps/backend/src/features/home-server/home-server-service.test.ts`

Expected: FAIL because `hardware` and `readHardware` are not part of the contracts.

- [ ] **Step 3: Wire the typed private field**

Import `HardwareTelemetry`, add `hardware` to `HomeServerTelemetry` and `HomeServerSnapshot`, and add `readHardware` to `HomeServerRuntime`. Collect it in the existing `Promise.all`. Keep `PublicHomeServerSnapshot` free of the property and continue constructing its host and service objects explicitly.

- [ ] **Step 4: Run focused tests and verify green**

Run: `bun test apps/backend/src/features/home-server/home-server-status.test.ts apps/backend/src/features/home-server/home-server-service.test.ts`

Expected: PASS, including serialized privacy assertions.

- [ ] **Step 5: Commit snapshot integration**

```bash
git add apps/backend/src/features/home-server/home-server-status.ts apps/backend/src/features/home-server/home-server-status.test.ts apps/backend/src/features/home-server/home-server-service.test.ts
git commit -m "feat: keep hardware telemetry private"
```

### Task 3: Production runtime wiring

**Files:**
- Modify: `apps/backend/src/features/home-server/home-server-runtime.ts`
- Modify: `apps/backend/src/features/home-server/home-server-runtime.test.ts`

- [ ] **Step 1: Add failing runtime assertions**

Inject `readHardware` into `createHomeServerRuntime`, return a fixed sample, and assert `runtime.readHardware()` resolves to it. Add `readHardware` to the complete default runtime method list.

- [ ] **Step 2: Run the runtime test and verify red**

Run: `bun test apps/backend/src/features/home-server/home-server-runtime.test.ts`

Expected: FAIL because the runtime has no hardware method.

- [ ] **Step 3: Add one runtime dependency**

Add `readHardware: () => Promise<HardwareTelemetry>` to `HomeServerRuntimeDependencies`, expose it directly on the returned runtime, and supply `readLinuxHardwareTelemetry` in `defaultHomeServerRuntime`. The collector itself catches per-file failures; do not add a shell-command fallback.

- [ ] **Step 4: Run the runtime test and verify green**

Run: `bun test apps/backend/src/features/home-server/home-server-runtime.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit runtime wiring**

```bash
git add apps/backend/src/features/home-server/home-server-runtime.ts apps/backend/src/features/home-server/home-server-runtime.test.ts
git commit -m "feat: expose hardware collector in runtime"
```

### Task 4: Client contract and presentation selection

**Files:**
- Modify: `apps/web/src/lib/homeServerClient.ts`
- Modify: `apps/web/src/lib/homeServerClient.test.ts`
- Modify: `apps/web/src/lib/homeServerPresentation.ts`
- Modify: `apps/web/src/lib/homeServerPresentation.test.ts`

- [ ] **Step 1: Write failing presentation tests**

Define private client types matching the backend. Add tests for `resolveHardwarePanel`:

```ts
expect(resolveHardwarePanel(snapshot)).toMatchObject({
  temperatures: [
    { key: "cpu", label: "CPU", celsius: 26 },
    { key: "gpu", label: "GPU", celsius: 28 },
    { key: "board", label: "主板 / ACPI", celsius: 27.8 },
    { key: "nvme", label: "NVMe", celsius: 46.9 },
  ],
  fans: [{ label: "风扇 1", rpm: 1264 }],
});
```

Also prove missing groups return `undefined` values/empty fans, labelled fans retain their safe label, and multiple NVMe inputs prefer `Composite`.

- [ ] **Step 2: Run client/presentation tests and verify red**

Run: `bun test apps/web/src/lib/homeServerClient.test.ts apps/web/src/lib/homeServerPresentation.test.ts`

Expected: FAIL because the hardware types and resolver do not exist.

- [ ] **Step 3: Implement deterministic selectors**

Add optional `hardware` to the client snapshot. Implement source/label matching in this order:

- CPU: `coretemp` + `Package id 0`, then any `Package` label.
- GPU: `nouveau`, `amdgpu`, or `nvidia` source.
- Board: `nct6683`/`nct6687` + `System`/`Motherboard`, then `acpitz`.
- NVMe: `nvme` + `Composite`, then the hottest valid NVMe input.

Return all valid fans in stable ID order and translate an absent/generic driver label to `风扇 N` without claiming CPU/SYS connector identity.

- [ ] **Step 4: Run client/presentation tests and verify green**

Run: `bun test apps/web/src/lib/homeServerClient.test.ts apps/web/src/lib/homeServerPresentation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit client presentation logic**

```bash
git add apps/web/src/lib/homeServerClient.ts apps/web/src/lib/homeServerClient.test.ts apps/web/src/lib/homeServerPresentation.ts apps/web/src/lib/homeServerPresentation.test.ts
git commit -m "feat: prepare hardware panel presentation"
```

### Task 5: Authenticated integrated host panel

**Files:**
- Create: `apps/web/src/components/widgets/HomeServerHostPanel.tsx`
- Create: `apps/web/src/components/widgets/HomeServerHostPanel.test.tsx`
- Modify: `apps/web/src/components/widgets/HomeServerWidget.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Write failing static-render tests**

Use `renderToStaticMarkup` with a private snapshot and assert the integrated structure contains temperatures, fan RPM, swap, the old CPU/RAM/disk values, and hkvps. Render the same snapshot with `readOnly={true}` and assert sensor labels/RPM/board model are absent while compact CPU/RAM/Disk remain.

```tsx
const privateMarkup = renderToStaticMarkup(
  <HomeServerHostPanel snapshot={snapshot} stale={false} readOnly={false} />,
);
expect(privateMarkup).toContain("硬件状态");
expect(privateMarkup).toContain("1264 RPM");
expect(privateMarkup).toContain("交换空间");

const publicMarkup = renderToStaticMarkup(
  <HomeServerHostPanel snapshot={snapshot} stale={false} readOnly />,
);
expect(publicMarkup).not.toContain("1264 RPM");
expect(publicMarkup).not.toContain("PRIVATE-MS-7D99");
expect(publicMarkup).toContain("RAM");
```

- [ ] **Step 2: Run the render test and verify red**

Run: `bun test apps/web/src/components/widgets/HomeServerHostPanel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Extract and implement the host panel**

Move the access-card and host-card rendering from `HomeServerWidget.tsx` into the new pure component. Gate the private layout on `!readOnly && snapshot.hardware`; otherwise render the unchanged compact layout. Keep `StatusDot` local or export a minimal shared state dot without adding a generic component layer.

Render the approved order:

```tsx
<TemperatureGrid items={panel.temperatures} />
<FanList items={panel.fans} />
<ResourceBars cpu={...} memory={...} swap={...} disk={...} />
<RemotePeerRow service={remoteHost} />
```

Use semantic labels and actual `<progress>` elements for resource values. Missing temperature/fan values use `未检测`; do not render `0 RPM` for an absent input.

- [ ] **Step 4: Add the approved optical styling**

Extend the current `.home-host-*` section with two-column temperature tiles, compact fan rows, and resource tracks. Preserve the cyan-to-green fill and add a restrained memory glow:

```css
.home-hardware-resource.is-memory progress::-webkit-progress-value {
  box-shadow: 0 0 7px #7feaff, 0 0 18px rgb(126 255 205 / 72%);
  animation: home-memory-glow 2.8s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .home-hardware-resource.is-memory progress::-webkit-progress-value { animation: none; }
}
```

- [ ] **Step 5: Run render and presentation tests**

Run: `bun test apps/web/src/components/widgets/HomeServerHostPanel.test.tsx apps/web/src/lib/homeServerPresentation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the integrated panel**

```bash
git add apps/web/src/components/widgets/HomeServerHostPanel.tsx apps/web/src/components/widgets/HomeServerHostPanel.test.tsx apps/web/src/components/widgets/HomeServerWidget.tsx apps/web/src/app/globals.css
git commit -m "feat: integrate private hardware panel"
```

### Task 6: Repository verification

**Files:**
- Modify only files required by failures found below.

- [ ] **Step 1: Run all home-server tests**

Run: `bun test apps/backend/src/features/home-server apps/web/src/lib/homeServerClient.test.ts apps/web/src/lib/homeServerPresentation.test.ts apps/web/src/components/widgets/HomeServerHostPanel.test.tsx`

Expected: PASS with no skipped hardware/privacy cases.

- [ ] **Step 2: Run focused lint and typecheck**

Run: `bunx eslint apps/backend/src/features/home-server apps/web/src/components/widgets/HomeServerHostPanel.tsx apps/web/src/components/widgets/HomeServerWidget.tsx apps/web/src/lib/homeServerClient.ts apps/web/src/lib/homeServerPresentation.ts --quiet`

Run: `bun run typecheck`

Expected: both exit 0.

- [ ] **Step 3: Run the production build**

Run: `bun run build`

Expected: backend TypeScript build and Vite web production build both exit 0.

- [ ] **Step 4: Review the final public boundary**

Run the route/status tests and inspect the diff for any spread of private snapshots into public response objects:

```bash
bun test apps/backend/src/features/home-server/home-server-route.test.ts apps/backend/src/features/home-server/home-server-status.test.ts
git diff --check
git diff --stat HEAD~5..HEAD
```

Expected: tests PASS, whitespace check clean, and no public DTO contains `hardware`.

- [ ] **Step 5: Commit any verification-only correction**

If a correction was required, commit only its exact files with `git commit -m "fix: harden private hardware telemetry"`. If nothing changed, do not create an empty commit.
