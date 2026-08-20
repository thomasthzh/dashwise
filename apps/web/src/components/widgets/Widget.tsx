"use client";

import { lazy, type ReactNode, Suspense } from "react";

import { getWidgetLoadTier } from "@/lib/widgetLoadPolicy";
import GlanceableClockWidget from "./dashboard/GlanceableClock";
import HomeServerWidget from "./HomeServerWidget";
import ProgressWidget from "./ProgressWidget";
import SearchBar from "./SearchBar";
import ShortcutsWidget from "./ShortcutsWidget";

const DeferredWidget = lazy(() => import("./DeferredWidget"));

export type WidgetProps = {
  type: string;
  consumerKey?: string;
  params?: Record<string, any>;
  className?: string;
  isPreview?: boolean;
  previewTemplate?: string;
  defaultOpen?: boolean;
  readOnly?: boolean;
};

// Kept for compatibility with existing widget item components.
export type WidgetItemProps = Pick<WidgetProps, "params" | "className">;

function stripWidgetIndex(params?: Record<string, any>) {
  if (!params || typeof params !== "object") return params;

  const { index: _index, _rev: _rev, ...rest } = params;
  return rest;
}

export function renderWidget({
  type,
  consumerKey,
  params,
  className,
  isPreview,
  defaultOpen,
  readOnly,
}: WidgetProps): ReactNode {
  const renderParams = stripWidgetIndex(params);
  const resolvedType = type === "widget" && typeof renderParams?.key === "string" && renderParams.key.trim()
    ? renderParams.key.trim()
    : type;
  const finalClassName = `${className ?? ""} frosted`.trim();

  if (getWidgetLoadTier(resolvedType) === "deferred") {
    return renderDeferredWidget({
      type: resolvedType,
      consumerKey,
      properties: renderParams,
      className: finalClassName,
      isPreview,
    });
  }

  const progressPeriod = resolveProgressPeriod(resolvedType, params);

  switch (resolvedType) {
    case "main-clock":
    case "glanceable-clock":
      return <GlanceableClockWidget className={className} params={renderParams} isPreview={isPreview} readOnly={readOnly} />;

    case "search-bar":
      return <SearchBar useRedirect={false} defaultOpen={defaultOpen} disabled={readOnly} />;

    case "progress":
    case "day-progress":
    case "week-progress":
    case "month-progress":
    case "year-progress":
      return <ProgressWidget period={progressPeriod} className={finalClassName} />;

    case "shortcuts":
      return <ShortcutsWidget className={finalClassName} shortcutIds={Array.isArray(renderParams?.shortcutIds) ? renderParams.shortcutIds : []} />;

    case "home-server-activity":
      return <HomeServerWidget variant="activity" className={className} readOnly={readOnly} />;

    case "home-server-services":
      return <HomeServerWidget variant="services" className={className} readOnly={readOnly} />;

    case "home-server-host":
      return <HomeServerWidget variant="host" className={className} readOnly={readOnly} />;

    case "placeholder":
      return <div className={className ?? ""} />;

    default:
      return renderDeferredWidget({
        type: resolvedType,
        consumerKey,
        properties: renderParams,
        className: finalClassName,
        isPreview,
      });
  }
}

function renderDeferredWidget({
  type,
  consumerKey,
  properties,
  className,
  isPreview,
}: {
  type: string;
  consumerKey?: string;
  properties?: Record<string, any>;
  className?: string;
  isPreview?: boolean;
}) {
  return (
    <Suspense fallback={<DeferredWidgetLoadingState className={className} />}>
      <DeferredWidget
        type={type}
        consumerKey={consumerKey}
        properties={properties}
        className={className}
        isPreview={isPreview}
      />
    </Suspense>
  );
}

function resolveProgressPeriod(type: string, params?: Record<string, any>) {
  const candidate = String(params?.period ?? type ?? "day").trim();
  if (candidate === "year" || candidate === "month" || candidate === "day" || candidate === "week") {
    return candidate;
  }

  if (candidate === "year-progress") return "year";
  if (candidate === "month-progress") return "month";
  if (candidate === "week-progress") return "week";
  return "day";
}

function DeferredWidgetLoadingState({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-xl p-3 flex items-center justify-center min-h-25 ${
        className ?? "frosted"
      }`}
    >
      <div className="text-xs text-white/50 animate-pulse">Loading widget data...</div>
    </div>
  );
}
