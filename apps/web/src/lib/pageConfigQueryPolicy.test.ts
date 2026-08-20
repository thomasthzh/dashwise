import { expect, test } from "bun:test";

import { resolvePageConfigAuthScope } from "./pageConfigQueryPolicy";

test("keeps the page-config cache stable when a user's session token rotates", () => {
  expect(resolvePageConfigAuthScope("token-a", "user-126f")).toBe("user:user-126f");
  expect(resolvePageConfigAuthScope("token-b", "user-126f")).toBe("user:user-126f");
});

test("isolates page configuration between authenticated users", () => {
  expect(resolvePageConfigAuthScope("token-a", "user-a")).not.toBe(
    resolvePageConfigAuthScope("token-b", "user-b"),
  );
});

test("falls back to the session token until user identity is available", () => {
  expect(resolvePageConfigAuthScope("token-a", null)).toBe("session:token-a");
  expect(resolvePageConfigAuthScope(null, null)).toBeNull();
});
