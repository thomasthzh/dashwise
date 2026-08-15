import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const installerPath = fileURLToPath(
  new URL("./install-token-connector.sh", import.meta.url),
);

test("installs an isolated least-privilege token connector", () => {
  expect(existsSync(installerPath)).toBe(true);
  if (!existsSync(installerPath)) return;

  const source = readFileSync(installerPath, "utf8");
  expect(source).toContain("DynamicUser=yes");
  expect(source).toContain("LoadCredential=cloudflared-token:");
  expect(source).toContain("--token-file %d/cloudflared-token");
  expect(source).toContain("NoNewPrivileges=true");
  expect(source).toContain("ProtectSystem=strict");
  expect(source).not.toMatch(/(?:^|\s)--token(?:=|\s)/m);
  expect(source).not.toContain("/etc/systemd/system/cloudflared.service");
});

test("validates before the first persistent mutation and supports rollback", () => {
  expect(existsSync(installerPath)).toBe(true);
  if (!existsSync(installerPath)) return;

  const source = readFileSync(installerPath, "utf8");
  expect(source).toContain('token_source="/tmp/cloudflared-${instance}.token"');
  expect(source).toContain('"${validator}" "${token_source}"');
  expect(source).toContain("mutation_started=false");
  expect(source).toContain("rollback() {");
  expect(source).toContain("trap rollback ERR");

  const validationOffset = source.indexOf('"${validator}" "${token_source}"');
  const mutationOffset = source.indexOf("mutation_started=true");
  const installOffset = source.indexOf('install -d -m 0700 "${config_root}"');
  expect(validationOffset).toBeGreaterThan(-1);
  expect(mutationOffset).toBeGreaterThan(validationOffset);
  expect(installOffset).toBeGreaterThan(mutationOffset);
});

test("waits for systemd to report an actually running connector", () => {
  expect(existsSync(installerPath)).toBe(true);
  if (!existsSync(installerPath)) return;

  const source = readFileSync(installerPath, "utf8");
  expect(source).toContain(
    'systemctl show --property=ActiveState --value "${unit_name}"',
  );
  expect(source).toContain(
    'systemctl show --property=SubState --value "${unit_name}"',
  );
  expect(source).toContain(
    '[[ ${active_state} == active && ${sub_state} == running ]]',
  );
  expect(source).not.toContain(
    'if systemctl is-active --quiet "${unit_name}"; then',
  );
});
