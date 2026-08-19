"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Icon } from "@iconify-icon/react";

import useAuth from "@/context/useAuth";
import HomeServerHostPanel from "./HomeServerHostPanel";
import {
  fetchHomeServerStatus,
  fetchPublicHomeServerStatus,
  reclaimHomeServerMemory,
  resolveHomeServerWidgetPolicy,
  type HomeServerService,
  type HomeServerSnapshot,
} from "@/lib/homeServerClient";
import { resolveHomeServerCardHref, resolveTelemetryFreshness } from "@/lib/homeServerPresentation";

type HomeServerWidgetProps = {
  variant: "activity" | "services" | "host";
  className?: string;
  readOnly?: boolean;
};

function StatusDot({ state }: { state: HomeServerService["state"] }) {
  return <span className={`home-status-dot is-${state}`} aria-label={state} />;
}

function ServiceCard({ service, readOnly }: { service: HomeServerService; readOnly: boolean }) {
  const href = resolveHomeServerCardHref(service.href, readOnly);
  const content = (
    <>
      {href && <Icon icon="fa6-solid:arrow-up-right-from-square" className="home-service-card__open" />}
      <span className="home-service-card__icon"><Icon icon={service.icon} /></span>
      <span className="home-service-card__name">{service.name}<StatusDot state={service.state} /></span>
      <span className="home-service-card__metric"><strong>{service.metric}</strong></span>
      <span className="home-service-card__detail">{service.detail}</span>
    </>
  );

  if (!href) return <article className="home-service-card optical-glass">{content}</article>;
  const external = /^https?:\/\//i.test(href);
  return (
    <a
      className="home-service-card optical-glass"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {content}
    </a>
  );
}

function LoadingPanel({ variant }: { variant: HomeServerWidgetProps["variant"] }) {
  const cards = variant === "services" ? 12 : 3;
  return (
    <div className={`home-server-loading is-${variant}`}>
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="optical-glass home-server-loading__item" />
      ))}
    </div>
  );
}

function ActivityPanel({ snapshot, stale }: { snapshot: HomeServerSnapshot; stale: boolean }) {
  const now = new Date();
  const healthy = snapshot.services.filter((service) => service.state === "online").length;
  const minecraft = snapshot.services.find((service) => service.id === "minecraft");
  const issues = snapshot.services.filter((service) => service.state !== "online");

  return (
    <div className="home-side-stack">
      <section className="home-date-card optical-glass">
        <span>{new Intl.DateTimeFormat("zh-HK", { weekday: "long" }).format(now)}</span>
        <strong>{now.getDate()}</strong>
        <small>{new Intl.DateTimeFormat("zh-HK", { year: "numeric", month: "long" }).format(now)}</small>
      </section>
      <section className="home-activity-card optical-glass">
        <header><span>实时状态</span><span className={`home-live-pill${stale ? " is-stale" : ""}`}><i /> {stale ? "陈旧" : "实时"}</span></header>
        <div className="home-activity-row">
          <Icon icon="fa6-solid:server" />
          <span><strong>{healthy} / {snapshot.services.length}</strong><small>服务在线</small></span>
        </div>
        <div className="home-activity-row">
          <Icon icon="fa6-solid:cube" />
          <span><strong>{minecraft?.metric || "—"}</strong><small>Minecraft 玩家</small></span>
        </div>
        <div className="home-activity-row">
          <Icon icon={issues.length ? "fa6-solid:triangle-exclamation" : "fa6-solid:circle-check"} />
          <span><strong>{issues.length ? `${issues.length} 项需留意` : "全部正常"}</strong><small>{issues[0]?.name || "最近一次探测通过"}</small></span>
        </div>
      </section>
    </div>
  );
}

export default function HomeServerWidget({ variant, className, readOnly = false }: HomeServerWidgetProps) {
  const { token, withAuth } = useAuth();
  const { usePrivateStatus, effectiveReadOnly } = resolveHomeServerWidgetPolicy(token, readOnly);
  const query = useQuery({
    queryKey: ["126f", "home-server-status", usePrivateStatus ? "private" : "public"],
    queryFn: () => usePrivateStatus
      ? withAuth((auth) => fetchHomeServerStatus(auth))
      : fetchPublicHomeServerStatus(),
    refetchInterval: 10_000,
    staleTime: 7_000,
    retry: 1,
  });
  const memoryReclaim = useMutation({
    mutationFn: () => withAuth((auth) => reclaimHomeServerMemory(auth)),
    onSuccess: () => query.refetch(),
  });

  if (query.isLoading || !query.data) {
    if (query.isError) {
      if (!usePrivateStatus) {
        return (
          <div role="status" className="home-status-error optical-glass">
            <Icon icon="fa6-solid:triangle-exclamation" /> 实时数据暂不可用
          </div>
        );
      }
      return (
        <button type="button" onClick={() => query.refetch()} className="home-status-error optical-glass">
          <Icon icon="fa6-solid:rotate" /> 实时数据暂不可用，点击重试
        </button>
      );
    }
    return <LoadingPanel variant={variant} />;
  }

  const freshness = resolveTelemetryFreshness({ hasData: Boolean(query.data), isError: query.isError || query.isRefetchError });
  const stale = freshness === "stale";
  if (variant === "activity") return <div className={className}><ActivityPanel snapshot={query.data} stale={stale} /></div>;
  if (variant === "host") return (
    <div className={className}>
      <HomeServerHostPanel
        snapshot={query.data}
        stale={stale}
        readOnly={effectiveReadOnly}
        onReclaimMemory={() => memoryReclaim.mutate()}
        memoryReclaiming={memoryReclaim.isPending}
        memoryReclaimedBytes={memoryReclaim.isPending ? undefined : memoryReclaim.data?.reclaimedBytes}
        memoryReclaimFailed={memoryReclaim.isError}
      />
    </div>
  );
  const localServices = query.data.services.filter((service) => service.origin === "126f");
  const remoteServices = query.data.services.filter((service) => service.origin !== "126f");
  const remoteLabel = remoteServices.some((service) => service.origin === "hkvps") ? "hkvps" : "远端";
  return (
    <section className={`home-services ${className || ""}`}>
      <header className="home-services__header">
        <span><strong>服务矩阵</strong><small>按两台服务器实际项目自动更新</small></span>
        <span className={`home-live-pill${stale ? " is-stale" : ""}`}><i /> {stale ? "陈旧" : "10s"}</span>
      </header>
      <div className="home-services__group">
        <div className="home-services__group-label"><span>126f</span><small>{localServices.length} 项</small></div>
        <div className="home-services__grid">
          {localServices.map((service) => <ServiceCard key={service.id} service={service} readOnly={effectiveReadOnly} />)}
        </div>
      </div>
      <div className="home-services__group">
        <div className="home-services__group-label"><span>{remoteLabel}</span><small>{remoteServices.length} 项</small></div>
        <div className="home-services__grid is-hkvps">
          {remoteServices.map((service) => <ServiceCard key={service.id} service={service} readOnly={effectiveReadOnly} />)}
        </div>
      </div>
    </section>
  );
}
