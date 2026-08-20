import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("dashboard page consumes the shared page-config query", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  expect(source).toContain("usePageConfig({ pageName })");
  expect(source).not.toContain("getPageConfigAction");
  expect(source).not.toContain("useEffect");
  expect(source).not.toContain("useState");
});
