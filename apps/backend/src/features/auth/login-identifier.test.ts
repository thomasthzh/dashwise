import { expect, test } from "bun:test";

import { resolveLoginIdentifier } from "./login-identifier";

test("maps the configured admin alias to its private PocketBase email", () => {
  expect(resolveLoginIdentifier(" THZH ", {
    alias: "thzh",
    email: "private@example.invalid",
  })).toBe("private@example.invalid");
});

test("leaves ordinary email identifiers unchanged", () => {
  expect(resolveLoginIdentifier(" user@example.com ", {
    alias: "thzh",
    email: "private@example.invalid",
  })).toBe("user@example.com");
});
