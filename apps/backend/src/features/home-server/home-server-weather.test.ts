import { expect, test } from "bun:test";

import { createHomeWeatherService } from "./home-server-weather";

function openMeteoPayload(temperature: number) {
  const times = Array.from({ length: 24 }, (_, hour) => `2026-08-19T${String(hour).padStart(2, "0")}:00`);
  return {
    current: {
      time: "2026-08-19T10:00",
      temperature_2m: temperature,
      weather_code: 2,
    },
    hourly: {
      time: times,
      temperature_2m: times.map((_, hour) => temperature + hour / 10),
      precipitation_probability: times.map((_, hour) => hour),
      weather_code: times.map(() => 2),
    },
    daily: {
      temperature_2m_max: [temperature + 4],
      temperature_2m_min: [temperature - 3],
      precipitation_probability_max: [68],
    },
  };
}

test("returns cached Celsius forecasts for Longgang and Songshan Lake", async () => {
  const requested: string[] = [];
  const service = createHomeWeatherService({
    now: () => Date.parse("2026-08-19T02:00:00.000Z"),
    fetch: async (input) => {
      const url = new URL(input);
      requested.push(url.toString());
      const temperature = url.searchParams.get("latitude") === "22.7217" ? 29 : 28;
      return Response.json(openMeteoPayload(temperature));
    },
  });

  const first = await service.read();
  const second = await service.read();

  expect(first).toEqual(second);
  expect(requested).toHaveLength(2);
  expect(first.locations.map((location) => location.name)).toEqual(["深圳龙岗", "东莞松山湖"]);
  expect(first.locations[0]).toMatchObject({
    temperatureC: 29,
    highC: 33,
    lowC: 26,
    precipitationProbability: 19,
    forecast: [
      { time: "2026-08-19T13:00", temperatureC: 30.3 },
      { time: "2026-08-19T16:00", temperatureC: 30.6 },
      { time: "2026-08-19T19:00", temperatureC: 30.9 },
    ],
  });
  expect(requested.every((url) => url.includes("timezone=Asia%2FShanghai"))).toBe(true);
  expect(requested.every((url) => url.includes("temperature_unit=celsius"))).toBe(true);
});
