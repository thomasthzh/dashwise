import { Icon } from "@iconify-icon/react";

import type { HomeWeatherLocation, HomeWeatherSnapshot } from "@dashwise/types/sdk";

type HomeWeatherCardProps = {
  weather?: HomeWeatherSnapshot;
  unavailable?: boolean;
  stale: boolean;
};

function weatherVisual(code: number) {
  if (code === 0) return { icon: "fa6-solid:sun", label: "晴" };
  if (code <= 2) return { icon: "fa6-solid:cloud-sun", label: "晴间多云" };
  if (code === 3) return { icon: "fa6-solid:cloud", label: "阴" };
  if (code === 45 || code === 48) return { icon: "fa6-solid:smog", label: "有雾" };
  if (code >= 95) return { icon: "fa6-solid:cloud-bolt", label: "雷雨" };
  if (code >= 80) return { icon: "fa6-solid:cloud-showers-heavy", label: "阵雨" };
  if (code >= 71) return { icon: "fa6-solid:snowflake", label: "降雪" };
  return { icon: "fa6-solid:cloud-rain", label: "降雨" };
}

function CityWeather({ location }: { location: HomeWeatherLocation }) {
  const visual = weatherVisual(location.weatherCode);
  return (
    <article className="home-weather-city">
      <div className="home-weather-city__heading">
        <span>{location.name}</span>
        <small>{visual.label}</small>
      </div>
      <div className="home-weather-city__current">
        <Icon icon={visual.icon} />
        <strong>{Math.round(location.temperatureC)}°C</strong>
      </div>
      <div className="home-weather-city__range">
        <span>最高 {Math.round(location.highC)}° · 最低 {Math.round(location.lowC)}°</span>
        <span><Icon icon="fa6-solid:droplet" /> 降雨 {Math.round(location.precipitationProbability)}%</span>
      </div>
      <div className="home-weather-forecast" aria-label={`${location.name}未来九小时预报`}>
        {location.forecast.map((point) => {
          const pointVisual = weatherVisual(point.weatherCode);
          return (
            <span key={point.time} title={`${pointVisual.label} · 降雨 ${Math.round(point.precipitationProbability)}%`}>
              <small>{point.time.slice(11, 16)}</small>
              <Icon icon={pointVisual.icon} />
              <strong>{Math.round(point.temperatureC)}°</strong>
            </span>
          );
        })}
      </div>
    </article>
  );
}

export default function HomeWeatherCard({ weather, unavailable = false, stale }: HomeWeatherCardProps) {
  const updatedAt = weather
    ? new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Shanghai",
    }).format(new Date(weather.generatedAt))
    : undefined;

  return (
    <section className="home-weather-card optical-glass">
      <header>
        <span><Icon icon="fa6-solid:location-dot" /> 双城天气</span>
        <span className={`home-live-pill${stale ? " is-stale" : ""}`}>
          <i /> {stale ? "陈旧" : updatedAt ? `${updatedAt} 更新` : "获取中"}
        </span>
      </header>
      {unavailable ? (
        <div className="home-weather-unavailable" role="status">
          <Icon icon="fa6-solid:cloud" /> 双城天气暂不可用
        </div>
      ) : weather ? (
        <div className="home-weather-cities">
          {weather.locations.map((location) => <CityWeather key={location.id} location={location} />)}
        </div>
      ) : (
        <div className="home-weather-unavailable" role="status">正在获取双城天气</div>
      )}
    </section>
  );
}
