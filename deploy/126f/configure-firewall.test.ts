import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./configure-firewall.sh", import.meta.url), "utf8");

test("opens Dashwise and Beszel only on the Tailnet interface", () => {
  expect(source).toContain('iifname "tailscale0" tcp dport { 3000, 8091 } accept');
  expect(source).not.toContain("ip6 saddr ::/0 tcp dport 3000");
  expect(source).not.toContain("ip6 saddr ::/0 tcp dport 8091");
  expect(source).not.toContain("3080");
});

test("checks and atomically persists the candidate without flushing live rules", () => {
  expect(source).toContain('nft -c -f "${candidate}"');
  expect(source).toContain('install -o "${config_uid}" -g "${config_gid}" -m "${config_mode}"');
  expect(source).toContain("trap rollback EXIT");
  expect(source).toContain('nft delete rule inet filter input handle "${added_handle}"');
  expect(source).not.toContain("systemctl reload nftables");
  expect(source).not.toContain("systemctl restart nftables");
  expect(source).not.toContain("flush ruleset");
});

test("refuses to open ports unless both services are listening", () => {
  expect(source).toContain("ss -lntH");
  expect(source).toContain("dashboard listener on TCP 3000 is missing");
  expect(source).toContain("Beszel listener on TCP 8091 is missing");
});
