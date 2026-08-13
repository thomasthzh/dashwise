import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./install-card-exporter.sh", import.meta.url), "utf8");

test("installs the exporter as an unprivileged Tailnet-only service", () => {
  expect(source).toContain("User=hkvps-status");
  expect(source).toContain("HKVPS_EXPORTER_LISTEN=100.122.69.109");
  expect(source).toContain("HKVPS_EXPORTER_PORT=9126");
  expect(source).toContain("NoNewPrivileges=true");
  expect(source).toContain("ProtectSystem=strict");
  expect(source).not.toMatch(/(?:user_password|api_token)=["'][^"']+["']/i);
});
