import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./initialize-admin.sh", import.meta.url), "utf8");

test("initializes the fixed 126f administrator without exposing credentials", () => {
  expect(source).toContain("read -r -s -p");
  expect(source).toContain("</dev/tty");
  expect(source).toContain("api_root=http://127.0.0.1:3000/api/v1/auth");
  expect(source).toContain('"${api_root}/signup"');
  expect(source).toContain('"${api_root}/login"');
  expect(source).toContain("DISABLE_USER_SIGNUP=true");
  expect(source).toContain('systemctl restart "${service_name}"');
  expect(source).not.toMatch(/dashboard_password=["'][^"']+["']/i);
  expect(source).not.toContain("--arg password");
});
