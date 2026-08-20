import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  shouldEnableProtectedSearch,
  shouldPollPageIntegrations,
  shouldRenderCommandBar,
} from "./publicInteractionAccess";

test("read-only public pages suppress protected background requests even with a stored token", () => {
  expect(shouldEnableProtectedSearch(true, true)).toBe(false);
  expect(shouldEnableProtectedSearch(true, false)).toBe(true);
  expect(shouldPollPageIntegrations("stale-token", true)).toBe(false);
  expect(shouldPollPageIntegrations("valid-token", false)).toBe(true);
});

test("command palette mounts only while an enabled search is open", () => {
  expect(shouldRenderCommandBar(false, false)).toBe(false);
  expect(shouldRenderCommandBar(true, true)).toBe(false);
  expect(shouldRenderCommandBar(true, false)).toBe(true);
});

test("search bar keeps the command palette behind a lazy boundary", () => {
  const source = readFileSync(
    new URL("../components/widgets/SearchBar.tsx", import.meta.url),
    "utf8",
  );

  expect(source).toContain("lazy(() => import('./CommandBar'))");
  expect(source).not.toContain("import CommandBar from './CommandBar'");
  expect(source).toContain("shouldRenderCommandBar(open, disabled)");
});
