import { Icon } from "@iconify-icon/react";

import type { HomeServerService, HomeServerSnapshot } from "@/lib/homeServerClient";
import {
  formatBinaryBytes,
  resolveHardwarePanel,
  resolveHomeAccessStates,
} from "@/lib/homeServerPresentation";

type HomeServerHostPanelProps = {
  snapshot: HomeServerSnapshot;
  stale: boolean;
  readOnly: boolean;
  onReclaimMemory?: () => void;
  memoryReclaiming?: boolean;
  memoryReclaimedBytes?: number;
  memoryReclaimFailed?: boolean;
};

function StatusDot({ state }: { state: HomeServerService["state"] }) {
  return <span className={`home-status-dot is-${state}`} aria-label={state} />;
}

function AccessCard({ snapshot }: { snapshot: HomeServerSnapshot }) {
  const access = resolveHomeAccessStates(snapshot.services);
  return (
    <section className="home-access-card optical-glass">
      <header><Icon icon="fa6-solid:shield-halved" /> 访问链路</header>
      <div>
        <span><i className={`is-${access.tailscale}`} />Tailscale</span>
        <span title="尚未配置独立探测"><i className={`is-${access.ipv6}`} />原生 IPv6</span>
        <span><i className={`is-${access.nps}`} />NPS</span>
      </div>
    </section>
  );
}

function PeerRow({ remoteHost }: { remoteHost: HomeServerService | undefined }) {
  return (
    <div className="home-peer-row">
      <Icon icon="fa6-solid:server" />
      <span>
        <strong>{remoteHost?.name || "远端服务器"}</strong>
        <small>{remoteHost?.detail || "远端链路"}</small>
      </span>
      <StatusDot state={remoteHost?.state || "unknown"} />
    </div>
  );
}

function HostHeader({ snapshot, stale, hardware = false, hardwareSummary }: {
  snapshot: HomeServerSnapshot;
  stale: boolean;
  hardware?: boolean;
  hardwareSummary?: string;
}) {
  return (
    <header>
      <span>
        <strong>{hardware ? `${snapshot.host.hostname} · 硬件状态` : snapshot.host.hostname}</strong>
        <small title={hardware ? hardwareSummary : undefined}>
          {hardware ? hardwareSummary || snapshot.hardware?.boardModel || "126f · Debian" : "126f · Debian"}
        </small>
      </span>
      <span className={`home-live-pill${stale ? " is-stale" : ""}`}>
        <i /> {stale ? "陈旧" : "在线"}
      </span>
    </header>
  );
}

function CompactHostCard({ snapshot, stale, remoteHost }: {
  snapshot: HomeServerSnapshot;
  stale: boolean;
  remoteHost: HomeServerService | undefined;
}) {
  const metrics = [
    { label: "CPU", value: snapshot.host.cpuPercent, detail: `load ${snapshot.host.load1.toFixed(2)}` },
    { label: "RAM", value: snapshot.host.memoryPercent, detail: `${formatBinaryBytes(snapshot.host.memoryUsedBytes)} / ${formatBinaryBytes(snapshot.host.memoryTotalBytes)}` },
    { label: "Disk", value: snapshot.host.diskPercent, detail: `${formatBinaryBytes(snapshot.host.diskUsedBytes)} / ${formatBinaryBytes(snapshot.host.diskTotalBytes)}` },
  ];

  return (
    <section className="home-host-card optical-glass">
      <HostHeader snapshot={snapshot} stale={stale} />
      <div className="home-host-metrics">
        {metrics.map((metric) => (
          <div key={metric.label} className="home-host-metric">
            <span><strong>{metric.label}</strong><em>{Math.round(metric.value)}%</em></span>
            <progress max="100" value={metric.value} />
            <small>{metric.detail}</small>
          </div>
        ))}
      </div>
      <PeerRow remoteHost={remoteHost} />
    </section>
  );
}

function percentage(used: number, total: number) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

function HardwareHostCard({
  snapshot,
  stale,
  remoteHost,
  onReclaimMemory,
  memoryReclaiming = false,
  memoryReclaimedBytes,
  memoryReclaimFailed = false,
}: {
  snapshot: HomeServerSnapshot;
  stale: boolean;
  remoteHost: HomeServerService | undefined;
  onReclaimMemory?: () => void;
  memoryReclaiming?: boolean;
  memoryReclaimedBytes?: number;
  memoryReclaimFailed?: boolean;
}) {
  const panel = resolveHardwarePanel(snapshot);
  if (!panel) return <CompactHostCard snapshot={snapshot} stale={stale} remoteHost={remoteHost} />;
  const cpu = panel.temperatures.find((temperature) => temperature.key === "cpu")?.celsius;
  const gpu = panel.temperatures.find((temperature) => temperature.key === "gpu")?.celsius;
  const hardwareSummary = [
    panel.boardModel || "126f",
    "Debian",
    cpu == null ? undefined : `CPU ${cpu.toFixed(1)}°C`,
    gpu == null ? undefined : `GPU ${gpu.toFixed(1)}°C`,
  ].filter(Boolean).join(" · ");
  const resources = [
    { key: "cpu", label: "CPU", value: snapshot.host.cpuPercent, detail: `load ${snapshot.host.load1.toFixed(2)}` },
    { key: "memory", label: "内存", value: snapshot.host.memoryPercent, detail: `${formatBinaryBytes(snapshot.host.memoryUsedBytes)} / ${formatBinaryBytes(snapshot.host.memoryTotalBytes)}` },
    { key: "swap", label: "交换空间", value: percentage(panel.swapUsedBytes, panel.swapTotalBytes), detail: `${formatBinaryBytes(panel.swapUsedBytes)} / ${formatBinaryBytes(panel.swapTotalBytes)}` },
    { key: "disk", label: "根存储", value: snapshot.host.diskPercent, detail: `${formatBinaryBytes(snapshot.host.diskUsedBytes)} / ${formatBinaryBytes(snapshot.host.diskTotalBytes)}` },
  ];

  return (
    <section className="home-host-card home-hardware-card optical-glass">
      <HostHeader snapshot={snapshot} stale={stale} hardware hardwareSummary={hardwareSummary} />

      <section className="home-hardware-section" aria-labelledby="home-hardware-temperature-title">
        <div className="home-hardware-section__title" id="home-hardware-temperature-title">
          <span>温度</span><small>10 秒刷新</small>
        </div>
        <div className="home-hardware-temperatures">
          {panel.temperatures.map((temperature) => (
            <div key={temperature.key} className="home-hardware-temperature">
              <small>{temperature.label}</small>
              <strong>{temperature.celsius == null ? "未检测" : `${temperature.celsius.toFixed(1)}°C`}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="home-hardware-section" aria-labelledby="home-hardware-fan-title">
        <div className="home-hardware-section__title" id="home-hardware-fan-title">
          <span>风扇转速</span><small>只读</small>
        </div>
        {panel.fans.length ? (
          <div className="home-hardware-fans">
            {panel.fans.map((fan) => (
              <div key={fan.id} className="home-hardware-fan">
                <span>{fan.label}</span>
                <progress max={Math.max(3_000, fan.rpm)} value={fan.rpm} />
                <strong>{fan.rpm} RPM</strong>
              </div>
            ))}
          </div>
        ) : <p className="home-hardware-empty">未检测到转速信号</p>}
      </section>

      <section className="home-hardware-section" aria-labelledby="home-hardware-resource-title">
        <div className="home-hardware-section__title" id="home-hardware-resource-title">
          <span>资源占用</span>
          {onReclaimMemory ? (
            <button
              type="button"
              className="home-memory-reclaim"
              onClick={onReclaimMemory}
              disabled={memoryReclaiming}
              aria-busy={memoryReclaiming}
              title="回收可重建的系统缓存"
            >
              <Icon icon={memoryReclaiming ? "fa6-solid:rotate" : "fa6-solid:broom"} />
              {memoryReclaiming ? "正在优化" : "优化内存"}
            </button>
          ) : null}
        </div>
        {memoryReclaimFailed ? (
          <p className="home-memory-reclaim-result is-error" role="status">优化失败，请重试</p>
        ) : memoryReclaimedBytes != null ? (
          <p className="home-memory-reclaim-result" role="status">
            已回收 {formatBinaryBytes(memoryReclaimedBytes)}
            {memoryReclaimedBytes === 0 ? "，当前无需清理" : ""}
          </p>
        ) : null}
        <div className="home-host-metrics home-hardware-resources">
          {resources.map((resource) => (
            <div key={resource.key} className={`home-host-metric home-hardware-resource is-${resource.key}`}>
              <span><strong>{resource.label}</strong><em>{Math.round(resource.value)}%</em></span>
              <progress max="100" value={resource.value} />
              <small>{resource.detail}</small>
            </div>
          ))}
        </div>
      </section>

      <PeerRow remoteHost={remoteHost} />
    </section>
  );
}

export default function HomeServerHostPanel({
  snapshot,
  stale,
  readOnly,
  onReclaimMemory,
  memoryReclaiming,
  memoryReclaimedBytes,
  memoryReclaimFailed,
}: HomeServerHostPanelProps) {
  const remoteHost = snapshot.services.find((service) => service.id === "hkvps" || service.id === "remote-host");
  return (
    <div className="home-side-stack">
      <AccessCard snapshot={snapshot} />
      {!readOnly && snapshot.hardware
        ? (
          <HardwareHostCard
            snapshot={snapshot}
            stale={stale}
            remoteHost={remoteHost}
            onReclaimMemory={onReclaimMemory}
            memoryReclaiming={memoryReclaiming}
            memoryReclaimedBytes={memoryReclaimedBytes}
            memoryReclaimFailed={memoryReclaimFailed}
          />
        )
        : <CompactHostCard snapshot={snapshot} stale={stale} remoteHost={remoteHost} />}
    </div>
  );
}
