import { expect, test } from "bun:test";

import {
  formatBinaryBytes,
  resolveOceanBackground,
  shouldPlayOceanVideo,
} from "./homeServerPresentation";

test("defaults the ocean selector to lightweight background B", () => {
  expect(resolveOceanBackground(null)).toBe("b");
  expect(resolveOceanBackground("unknown")).toBe("b");
  expect(resolveOceanBackground("e")).toBe("e");
});

test("keeps the selected moving ocean active when reduced motion is preferred", () => {
  expect(shouldPlayOceanVideo({ pageVisible: true, prefersReducedMotion: true })).toBe(true);
  expect(shouldPlayOceanVideo({ pageVisible: false, prefersReducedMotion: true })).toBe(false);
});

test("formats binary host capacity values compactly", () => {
  expect(formatBinaryBytes(13_744_488_448)).toBe("12.8 GiB");
  expect(formatBinaryBytes(972_810_190_848)).toBe("906 GiB");
});
