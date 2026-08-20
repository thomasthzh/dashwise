import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import LocalGlanceable from "./LocalGlanceable";

const formatters = {
  formatDate: () => "20-08-2026",
  formatTime: () => "18:20",
};

test("renders the configured local date without the generic integration runtime", () => {
  const markup = renderToStaticMarkup(
    <LocalGlanceable type="date" params={{ format: "DD-MM-YYYY" }} formatters={formatters} />,
  );

  expect(markup).toContain("20-08-2026");
});

test("renders local progress with its established label", () => {
  const markup = renderToStaticMarkup(
    <LocalGlanceable type="day-progress" formatters={formatters} />,
  );

  expect(markup).toContain("Day:");
  expect(markup).toContain("%");
});
