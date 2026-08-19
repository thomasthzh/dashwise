import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { HomeWeatherSnapshot } from "@dashwise/types/sdk";
import HomeWeatherCard from "./HomeWeatherCard";

const weather: HomeWeatherSnapshot = {
  generatedAt: "2026-08-19T02:00:00.000Z",
  locations: [
    {
      id: "longgang",
      name: "深圳龙岗",
      temperatureC: 29,
      weatherCode: 2,
      highC: 33,
      lowC: 26,
      precipitationProbability: 68,
      forecast: [
        { time: "2026-08-19T13:00", temperatureC: 30, weatherCode: 2, precipitationProbability: 20 },
        { time: "2026-08-19T16:00", temperatureC: 31, weatherCode: 80, precipitationProbability: 52 },
        { time: "2026-08-19T19:00", temperatureC: 28, weatherCode: 95, precipitationProbability: 68 },
      ],
    },
    {
      id: "songshan-lake",
      name: "东莞松山湖",
      temperatureC: 28,
      weatherCode: 1,
      highC: 32,
      lowC: 25,
      precipitationProbability: 44,
      forecast: [],
    },
  ],
};

test("renders both city forecasts in Celsius without duplicating the date", () => {
  const markup = renderToStaticMarkup(<HomeWeatherCard weather={weather} stale={false} />);

  expect(markup).toContain("深圳龙岗");
  expect(markup).toContain("东莞松山湖");
  expect(markup).toContain("29°C");
  expect(markup).toContain("最高 33° · 最低 26°");
  expect(markup).toContain("13:00");
  expect(markup).toContain("降雨 68%");
  expect(markup).not.toContain("2026年8月");
  expect(markup).not.toContain("°F");
});

test("states weather failure directly instead of inventing fallback values", () => {
  const markup = renderToStaticMarkup(<HomeWeatherCard unavailable stale />);

  expect(markup).toContain("双城天气暂不可用");
  expect(markup).not.toContain("0°C");
});
