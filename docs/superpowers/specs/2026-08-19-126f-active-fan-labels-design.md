# 126f Active Fan Labels Design

## Context

The private hardware card currently renders every NCT6687 fan input, including unused channels at 0 RPM, and falls back to generic labels such as `风扇 1`. On the exact 126f board, `B760M GAMING PLUS WIFI DDR4 II (MS-7D99)`, three consecutive live samples showed only `fan1` and `fan3` producing tachometer signals. MSI documents CPU, pump, and system fan headers for this board; the established MSI NCT6687 ordering maps the first and third inputs to CPU fan and system fan 1.

## Approved behavior

- Keep the raw backend telemetry and shared API contract unchanged.
- In the private-panel presentation layer, render only fans whose RPM is greater than zero.
- Only for the exact 126f board and an `nct6687` source, label generic `Fan 1` as `CPU 风扇` and generic `Fan 3` as `机箱风扇 1`.
- Preserve a non-generic kernel label if one becomes available; do not replace it with the board mapping.
- Leave any other active generic channel as `风扇 N` rather than guessing its physical connector.
- If no fan has an RPM signal, retain the existing `未检测到转速信号` empty state.
- A fan that reports zero disappears on that refresh and reappears when its RPM becomes positive.

## Data flow and boundaries

`readLinuxHardwareTelemetry` continues collecting all valid inputs, including zero RPM. `resolveHardwarePanel` remains the single presentation boundary: it filters inactive fans, applies the exact-board labels, and returns the rows consumed by `HomeServerHostPanel`. This keeps diagnostics available to authenticated API consumers while making the dashboard concise. Public responses and the anonymous compact card remain unchanged and continue to exclude hardware telemetry.

## Verification

- Presentation test: exact board with active `fan1`, inactive `fan2`, and active `fan3` resolves to exactly `CPU 风扇` and `机箱风扇 1`.
- Presentation test: non-generic labels and active unknown channels remain truthful; zero-RPM rows are absent.
- Component test: administrator markup contains both approved labels and no `0 RPM` row.
- Run the focused hardware/privacy tests, changed-file ESLint, backend TypeScript no-emit check, and Vite production build.
- Deploy through the existing atomic 126f release flow, then verify the authenticated card and confirm the public hardware boundary is unchanged.

## Non-goals

- No fan control, PWM writes, BIOS changes, or system-level sensor relabeling.
- No backend filtering or API schema change.
- No guessed mapping for other boards or currently inactive/unknown channels.
