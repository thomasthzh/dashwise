import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./initialize-beszel.sh", import.meta.url), "utf8");

test("creates the Beszel administrator and enables the protected universal token", () => {
  expect(source).toContain("read -r -s -p");
  expect(source).toContain("</dev/tty");
  expect(source).toContain("/api/beszel/create-user");
  expect(source).toContain("/api/collections/users/auth-with-password");
  expect(source).toContain("/api/beszel/universal-token");
  expect(source).toContain("/etc/beszel-126f/agent-token");
  expect(source).toContain("urllib.request");
  expect(source).not.toContain("Authorization: Bearer");
  expect(source).not.toMatch(/beszel_password=["'][^"']+["']/i);
});
