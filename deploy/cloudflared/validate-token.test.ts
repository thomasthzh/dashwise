import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const validatorPath = fileURLToPath(new URL("./validate-token.py", import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runValidator(contents: string) {
  expect(existsSync(validatorPath)).toBe(true);
  if (!existsSync(validatorPath)) return null;

  const directory = mkdtempSync(join(tmpdir(), "cloudflared-token-test-"));
  temporaryDirectories.push(directory);
  const tokenPath = join(directory, "token");
  writeFileSync(tokenPath, contents, { encoding: "ascii", mode: 0o600 });

  return Bun.spawnSync(["python", validatorPath, tokenPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
}

const validToken = Buffer.from(
  JSON.stringify({ a: "account-id", t: "tunnel-id", s: "connector-secret" }),
).toString("base64url");

test("accepts exactly one Cloudflare tunnel token", () => {
  const result = runValidator(`${validToken}\n`);
  expect(result?.exitCode).toBe(0);
  expect(result?.stdout.toString()).toBe("");
});

test("rejects a token file containing two valid lines", () => {
  const result = runValidator(`${validToken}\n${validToken}\n`);
  expect(result?.exitCode).not.toBe(0);
  expect(result?.stderr.toString()).not.toContain(validToken);
});

test("rejects surrounding whitespace instead of silently trimming it", () => {
  const result = runValidator(` ${validToken}\n`);
  expect(result?.exitCode).not.toBe(0);
  expect(result?.stderr.toString()).not.toContain(validToken);
});
