import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./install-beszel-agent.sh", import.meta.url), "utf8");

test("installs the pinned hkvps agent without granting Docker-root access", () => {
  expect(source).toContain("beszel_version=0.18.7");
  expect(source).toContain("4ae327aac5ad5a231845b0ef613066d555bbe52f7ecb2f28a53d07c04e689aff");
  expect(source).toContain("sha256sum -c -");
  expect(source).toContain("User=beszel");
  expect(source).toContain("HUB_URL=http://100.80.188.111:8091");
  expect(source).toContain("TOKEN_FILE=/etc/beszel-agent-hkvps/token");
  expect(source).toContain("DISABLE_SSH=true");
  expect(source).toContain("DOCKER_HOST=");
  expect(source).not.toContain("docker group");
  expect(source).not.toContain("usermod");
  expect(source).not.toMatch(/(?:user_password|agent_token)=["'][^"']+["']/i);
});
