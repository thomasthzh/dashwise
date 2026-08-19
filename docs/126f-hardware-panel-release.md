# 126f private hardware panel release

This release adds a private, authenticated hardware overview to the existing 126f host card.

- Temperatures and fan speeds are read from Linux hwmon without writing control values.
- CPU, memory, swap, and storage usage remain in the same host panel and retain the luminous utilization bars.
- Missing sensors are omitted instead of replaced with fabricated values.
- The anonymous status response and read-only dashboard never include the hardware payload.
- The public host card keeps the compact resource summary; the expanded hardware layout is available only after authentication.
- Production packaging installs the same verified Vite entrypoint into the backend runtime's `dist/public` directory.
