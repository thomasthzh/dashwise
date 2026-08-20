import { useEffect, useMemo, useState } from "react";

type LocalGlanceableProps = {
  type: string;
  params?: Record<string, any>;
  className?: string;
  formatters?: {
    formatDate: (input?: Date | string | number, overrideFormat?: string) => string;
    formatTime: (input?: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  };
};

export default function LocalGlanceable({
  type,
  params,
  className,
  formatters,
}: LocalGlanceableProps) {
  switch (type) {
    case "date":
      return (
        <span className={`inline-flex items-center text-center ${className ?? ""}`}>
          {formatDate(new Date(), params?.format, formatters)}
        </span>
      );

    case "greeting":
      return <GreetingGlanceable params={params} className={className} />;

    case "local-timezone":
      return (
        <span className={`inline-flex items-center text-center ${className ?? ""}`}>
          {getLocalTimezoneLabel()}
        </span>
      );

    case "world-clock":
      return <WorldClockGlanceable params={params} className={className} formatters={formatters} />;

    case "progress":
    case "day-progress":
    case "week-progress":
    case "month-progress":
    case "year-progress":
      return (
        <ProgressGlanceable
          period={resolveProgressPeriod(type, params)}
          params={params}
          className={className}
        />
      );

    default:
      return (
        <span className={`inline-flex items-center text-center ${className ?? ""}`}>
          {params?.name ?? type}
        </span>
      );
  }
}

function WorldClockGlanceable({
  params,
  className,
  formatters,
}: Omit<LocalGlanceableProps, "type">) {
  const timezone = useMemo(() => normalizeTimezone(params?.timezone), [params?.timezone]);
  const location = useMemo(() => String(params?.location ?? "").trim(), [params?.location]);
  const [time, setTime] = useState(() => formatTime(new Date(), timezone ? { timeZone: timezone } : undefined, formatters));

  useEffect(() => {
    const updateTime = () => {
      setTime(formatTime(new Date(), timezone ? { timeZone: timezone } : undefined, formatters));
    };
    const interval = window.setInterval(updateTime, 60_000);
    return () => window.clearInterval(interval);
  }, [formatters, timezone]);

  return (
    <span className={`inline-flex items-center text-center ${className ?? ""}`}>
      {time}{location ? ` in ${location}` : ""}
    </span>
  );
}

function GreetingGlanceable({
  params,
  className,
}: Pick<LocalGlanceableProps, "params" | "className">) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const hour = now.getHours();
  const greeting = hour >= 5 && hour < 12
    ? "Good morning"
    : hour >= 12 && hour < 17
      ? "Good afternoon"
      : hour >= 17 && hour < 22
        ? "Good evening"
        : "Good night";
  const username = typeof params?.username === "string" ? params.username.trim() : "";

  return (
    <span className={`inline-flex items-center text-center ${className ?? ""}`}>
      {greeting}{params?.showUsername === true && username ? `, ${username}` : ""}
    </span>
  );
}

type ProgressPeriod = "day" | "week" | "month" | "year";

const PROGRESS_LABELS: Record<ProgressPeriod, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
};

function ProgressGlanceable({
  period,
  params,
  className,
}: {
  period: ProgressPeriod;
  params?: Record<string, any>;
  className?: string;
}) {
  const [percentage, setPercentage] = useState(() => formatProgress(period));

  useEffect(() => {
    const interval = window.setInterval(() => setPercentage(formatProgress(period)), 60_000);
    return () => window.clearInterval(interval);
  }, [period]);

  const label = params?.label !== undefined ? String(params.label) : PROGRESS_LABELS[period];
  return (
    <span className={`inline-flex items-center text-center ${className ?? ""}`}>
      {label}: {percentage}
    </span>
  );
}

function formatProgress(period: ProgressPeriod) {
  return `${calculateProgress(period).toFixed(1)}%`;
}

function calculateProgress(period: ProgressPeriod) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const millisecondsInDay = 24 * 60 * 60 * 1000;

  if (period === "day") {
    return ((now.getTime() - startOfDay.getTime()) / millisecondsInDay) * 100;
  }

  if (period === "week") {
    const sunday = new Date(startOfDay);
    sunday.setDate(sunday.getDate() - now.getDay());
    return ((now.getTime() - sunday.getTime()) / (7 * millisecondsInDay)) * 100;
  }

  if (period === "month") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const elapsedDays = now.getDate() - 1 + (now.getTime() - startOfDay.getTime()) / millisecondsInDay;
    return (elapsedDays / daysInMonth) * 100;
  }

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const nextYear = new Date(now.getFullYear() + 1, 0, 1);
  return ((now.getTime() - startOfYear.getTime()) / (nextYear.getTime() - startOfYear.getTime())) * 100;
}

function resolveProgressPeriod(type: string, params?: Record<string, any>): ProgressPeriod {
  const candidate = String(params?.period ?? params?.type ?? type ?? "day").trim();
  if (candidate === "year" || candidate === "month" || candidate === "day" || candidate === "week") {
    return candidate;
  }
  if (candidate === "year-progress") return "year";
  if (candidate === "month-progress") return "month";
  if (candidate === "week-progress") return "week";
  return "day";
}

function getLocalTimezoneLabel() {
  const timezoneName = Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value;
  if (timezoneName) return timezoneName;

  const offset = -new Date().getTimezoneOffset() / 60;
  return `GMT${offset >= 0 ? "+" : ""}${offset}`;
}

function normalizeTimezone(value: unknown) {
  const timezone = typeof value === "string" ? value.trim() : "";
  if (!timezone) return undefined;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return undefined;
  }
}

function formatDate(
  input: Date,
  overrideFormat: unknown,
  formatters?: LocalGlanceableProps["formatters"],
) {
  const pattern = typeof overrideFormat === "string" ? overrideFormat : undefined;
  if (formatters?.formatDate) return formatters.formatDate(input, pattern);

  const day = String(input.getDate()).padStart(2, "0");
  const month = String(input.getMonth() + 1).padStart(2, "0");
  const year = String(input.getFullYear());
  return (pattern || "DD-MM-YYYY")
    .replace("DD", day)
    .replace("MM", month)
    .replace("YYYY", year);
}

function formatTime(
  input: Date,
  options: Intl.DateTimeFormatOptions | undefined,
  formatters?: LocalGlanceableProps["formatters"],
) {
  if (formatters?.formatTime) return formatters.formatTime(input, options);
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(input);
}
