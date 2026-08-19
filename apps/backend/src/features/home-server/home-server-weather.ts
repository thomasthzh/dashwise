import type {
  HomeWeatherForecastPoint,
  HomeWeatherLocation,
  HomeWeatherSnapshot,
} from "@dashwise/types/sdk";

type FetchLike = (input: string | URL) => Promise<Response>;

type OpenMeteoPayload = {
  current?: { time?: unknown; temperature_2m?: unknown; weather_code?: unknown };
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
    precipitation_probability?: unknown;
    weather_code?: unknown;
  };
  daily?: {
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
  };
};

const LOCATIONS = [
  { id: "longgang", name: "深圳龙岗", latitude: "22.7217", longitude: "114.2469" },
  { id: "songshan-lake", name: "东莞松山湖", latitude: "22.9096", longitude: "113.8758" },
] as const;

function finiteNumber(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Weather response is missing ${field}`);
  return number;
}

function firstArrayValue(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`Weather response is missing ${field}`);
  return finiteNumber(value[0], field);
}

function forecastPoints(payload: OpenMeteoPayload): HomeWeatherForecastPoint[] {
  const times = payload.hourly?.time;
  const temperatures = payload.hourly?.temperature_2m;
  const precipitation = payload.hourly?.precipitation_probability;
  const weatherCodes = payload.hourly?.weather_code;
  const currentTime = payload.current?.time;
  if (!Array.isArray(times) || !Array.isArray(temperatures) || !Array.isArray(precipitation)
    || !Array.isArray(weatherCodes) || typeof currentTime !== "string") {
    throw new Error("Weather response is missing hourly forecast data");
  }

  const currentIndex = Math.max(0, times.findIndex((time) => typeof time === "string" && time >= currentTime));
  return [3, 6, 9].flatMap((offset) => {
    const index = currentIndex + offset;
    const time = times[index];
    if (typeof time !== "string") return [];
    return [{
      time,
      temperatureC: finiteNumber(temperatures[index], "hourly temperature"),
      precipitationProbability: finiteNumber(precipitation[index], "hourly precipitation probability"),
      weatherCode: finiteNumber(weatherCodes[index], "hourly weather code"),
    }];
  });
}

async function fetchLocation(
  location: typeof LOCATIONS[number],
  fetchImpl: FetchLike,
): Promise<HomeWeatherLocation> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    current: "temperature_2m,weather_code",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "temperature_2m_max,temperature_2m_min",
    forecast_days: "2",
    timezone: "Asia/Shanghai",
    temperature_unit: "celsius",
  }).toString();

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Weather request failed with ${response.status}`);
  const payload = await response.json() as OpenMeteoPayload;
  const forecast = forecastPoints(payload);
  if (forecast.length === 0) throw new Error("Weather response has no future forecast points");

  return {
    id: location.id,
    name: location.name,
    temperatureC: finiteNumber(payload.current?.temperature_2m, "current temperature"),
    weatherCode: finiteNumber(payload.current?.weather_code, "current weather code"),
    highC: firstArrayValue(payload.daily?.temperature_2m_max, "daily high"),
    lowC: firstArrayValue(payload.daily?.temperature_2m_min, "daily low"),
    precipitationProbability: Math.max(...forecast.map((point) => point.precipitationProbability)),
    forecast,
  };
}

export function createHomeWeatherService(options?: {
  fetch?: FetchLike;
  now?: () => number;
  ttlMs?: number;
}) {
  const fetchImpl = options?.fetch ?? fetch;
  const now = options?.now ?? Date.now;
  const ttlMs = options?.ttlMs ?? 600_000;
  let cached: { storedAt: number; value: HomeWeatherSnapshot } | undefined;

  return {
    async read(): Promise<HomeWeatherSnapshot> {
      const currentTime = now();
      if (cached && currentTime - cached.storedAt < ttlMs) return cached.value;
      const locations = await Promise.all(LOCATIONS.map((location) => fetchLocation(location, fetchImpl)));
      const value = { generatedAt: new Date(currentTime).toISOString(), locations };
      cached = { storedAt: currentTime, value };
      return value;
    },
  };
}
