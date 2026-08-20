import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("initial document keeps remote typography off the render-blocking CSS path", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

  expect(css).not.toContain("fonts.googleapis.com");
  expect(html).toContain('rel="preconnect" href="https://fonts.googleapis.com"');
  expect(html).toContain('rel="preconnect" href="https://fonts.gstatic.com" crossorigin');
  expect(html).toContain('rel="preconnect" href="https://api.iconify.design"');
  expect(html).toMatch(/media="print"\s+onload="this\.media='all'"/);
  expect(html).toContain("<noscript>");
  expect(html).toContain("family=Geist:wght@400;500;600;700");
});
