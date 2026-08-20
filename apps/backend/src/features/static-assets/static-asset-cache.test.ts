import { expect, test } from "bun:test";

import { resolveStaticResponseHeaders } from "./static-asset-cache";

test("marks content-addressed Vite assets immutable", () => {
  expect(resolveStaticResponseHeaders(
    "/assets/Widget-BoA6lEcp.js",
    "application/javascript; charset=utf-8",
  )).toEqual({
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "application/javascript; charset=utf-8",
  });
});

test("keeps stable background filenames revalidatable", () => {
  expect(resolveStaticResponseHeaders(
    "/backgrounds/ocean-b.mp4",
    "video/mp4",
  )).toEqual({
    "Content-Type": "video/mp4",
  });
});

test("keeps fonts immutable", () => {
  expect(resolveStaticResponseHeaders(
    "/fonts/geist-latin.woff2",
    "font/woff2",
  )).toEqual({
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "font/woff2",
  });
});

test("forces SPA HTML to revalidate with an explicit content type", () => {
  expect(resolveStaticResponseHeaders(
    "/index.html",
    "text/html; charset=utf-8",
  )).toEqual({
    "Cache-Control": "no-cache",
    "Content-Type": "text/html; charset=utf-8",
  });
});
