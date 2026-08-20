import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("initial document serves critical typography locally", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

  expect(css).not.toContain("fonts.googleapis.com");
  expect(css).toContain('url("/fonts/geist-latin.woff2")');
  expect(css).toContain('url("/fonts/geist-mono-latin.woff2")');
  expect(html).not.toContain("fonts.googleapis.com");
  expect(html).not.toContain("fonts.gstatic.com");
  expect(html).toContain('rel="preconnect" href="https://api.iconify.design"');
  expect(html).toContain('href="/fonts/geist-latin.woff2"');
  expect(html).toContain('as="font"');
});
