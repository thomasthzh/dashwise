import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./install-beszel.sh", import.meta.url), "utf8");

test("installs a pinned Beszel hub and local agent with verified assets", () => {
  expect(source).toContain("beszel_version=0.18.7");
  expect(source).toContain("b75c52a82af5c9721f08a7a9cb0c16df27e81967a3855cef7c77dbad9fb43524");
  expect(source).toContain("4ae327aac5ad5a231845b0ef613066d555bbe52f7ecb2f28a53d07c04e689aff");
  expect(source).toContain("sha256sum -c -");
  expect(source).toContain("User=beszel");
  expect(source).toContain("--http \"0.0.0.0:8091\"");
  expect(source).toContain("LISTEN=127.0.0.1:45876");
  expect(source).toContain("HUB_URL=http://127.0.0.1:8091");
  expect(source).toContain("DISABLE_SSH=true");
  expect(source).toContain("KEY_FILE=/etc/beszel-126f/agent-key");
  expect(source).toContain("TOKEN_FILE=/etc/beszel-126f/agent-token");
  expect(source).not.toMatch(/(?:user_password|agent_token)=["'][^"']+["']/i);
});
