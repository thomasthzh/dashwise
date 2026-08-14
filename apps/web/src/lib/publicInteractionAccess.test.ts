import { expect, test } from "bun:test";

import { shouldEnableProtectedSearch, shouldPollPageIntegrations } from "./publicInteractionAccess";

test("read-only public pages suppress protected background requests even with a stored token", () => {
  expect(shouldEnableProtectedSearch(true, true)).toBe(false);
  expect(shouldEnableProtectedSearch(true, false)).toBe(true);
  expect(shouldPollPageIntegrations("stale-token", true)).toBe(false);
  expect(shouldPollPageIntegrations("valid-token", false)).toBe(true);
});
