import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { shouldValidateAuthToken } from "./authValidationPolicy";

test("does not validate without an authenticated token", () => {
  expect(shouldValidateAuthToken(null, null)).toBe(false);
});

test("validates an available session token", () => {
  expect(shouldValidateAuthToken("session-a", null)).toBe(true);
});

test("does not immediately revalidate the replacement token it just received", () => {
  expect(shouldValidateAuthToken("session-b", "session-b")).toBe(false);
});

test("validates a genuinely different later token", () => {
  expect(shouldValidateAuthToken("session-c", "session-b")).toBe(true);
});

test("authenticated shell uses one stable provider tree", () => {
  const source = readFileSync(
    new URL("../components/AuthWrapper.tsx", import.meta.url),
    "utf8",
  );

  expect(source).not.toContain("isMounted");
  expect(source.match(/<LocalizationProvider>/g)?.length).toBe(1);
  expect(source).toContain("shouldValidateAuthToken(");
});
