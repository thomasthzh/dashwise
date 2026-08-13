import { expect, test } from "bun:test";

import {
  formatBinaryBytes,
  resolveOceanBackground,
} from "./homeServerPresentation";

test("defaults the ocean selector to lightweight background B", () => {
  expect(resolveOceanBackground(null)).toBe("b");
  expect(resolveOceanBackground("unknown")).toBe("b");
  expect(resolveOceanBackground("e")).toBe("e");
});

test("formats binary host capacity values compactly", () => {
  expect(formatBinaryBytes(13_744_488_448)).toBe("12.8 GiB");
  expect(formatBinaryBytes(972_810_190_848)).toBe("906 GiB");
});
