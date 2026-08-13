#!/usr/bin/env python3
"""Tailnet-only, allowlisted hkvps status exporter for the 126f homepage."""

from __future__ import annotations

import http.client
import json
import os
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable


def unit_is_active(unit: str) -> bool:
    try:
        result = subprocess.run(
            ["systemctl", "is-active", "--quiet", unit],
            check=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2,
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def http_is_alive(port: int) -> bool:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=1.2)
    try:
        connection.request("GET", "/", headers={"User-Agent": "126f-card-exporter/1"})
        response = connection.getresponse()
        response.read(256)
        return response.status < 500
    except (OSError, http.client.HTTPException):
        return False
    finally:
        connection.close()


def _cpu_sample() -> tuple[int, int]:
    with open("/proc/stat", "r", encoding="utf-8") as proc_stat:
        values = [int(value) for value in proc_stat.readline().split()[1:]]
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    return idle, sum(values)


def read_host_metrics() -> dict[str, float | int]:
    idle_before, total_before = _cpu_sample()
    time.sleep(0.12)
    idle_after, total_after = _cpu_sample()
    total_delta = max(1, total_after - total_before)
    idle_delta = max(0, idle_after - idle_before)
    cpu_percent = max(0.0, min(100.0, (total_delta - idle_delta) * 100 / total_delta))

    memory: dict[str, int] = {}
    with open("/proc/meminfo", "r", encoding="utf-8") as meminfo:
        for line in meminfo:
            key, raw_value = line.split(":", 1)
            memory[key] = int(raw_value.strip().split()[0]) * 1024
    memory_total = memory.get("MemTotal", 0)
    memory_available = memory.get("MemAvailable", 0)
    memory_percent = 0 if memory_total <= 0 else (memory_total - memory_available) * 100 / memory_total

    disk = shutil.disk_usage("/")
    with open("/proc/uptime", "r", encoding="utf-8") as proc_uptime:
        uptime_seconds = int(float(proc_uptime.read().split()[0]))
    return {
        "cpuPercent": round(cpu_percent, 1),
        "memoryPercent": round(max(0.0, min(100.0, memory_percent)), 1),
        "diskPercent": round(disk.used * 100 / disk.total, 1) if disk.total else 0,
        "uptimeSeconds": uptime_seconds,
        "load1": round(os.getloadavg()[0], 2),
    }


def _paired_state(first: bool, second: bool) -> str:
    if first and second:
        return "online"
    if first or second:
        return "degraded"
    return "offline"


def _counted_state(values: list[bool]) -> dict[str, int | str]:
    online = sum(values)
    total = len(values)
    state = "online" if online == total else "degraded" if online else "offline"
    return {"state": state, "online": online, "total": total}


def build_snapshot(
    unit_probe: Callable[[str], bool] = unit_is_active,
    http_probe: Callable[[int], bool] = http_is_alive,
    host_probe: Callable[[], dict[str, float | int]] = read_host_metrics,
) -> dict[str, object]:
    service_ports = {
        "adguard": ("AdGuardHome.service", 3001),
        "moonlight": ("moonlight-blog.service", 3100),
        "netwatch": ("netwatch-dashboard.service", 29876),
        "serviceHub": ("service-hub.service", 3000),
        "weiqi": ("weiqi.service", 8000),
        "netdata": ("netdata.service", 19999),
    }
    services: dict[str, dict[str, int | str]] = {}
    for service_id, (unit, port) in service_ports.items():
        services[service_id] = {"state": _paired_state(unit_probe(unit), http_probe(port))}

    services["syncaction"] = _counted_state([http_probe(29373), http_probe(29374)])
    services["edge"] = _counted_state([
        unit_probe("caddy.service"),
        unit_probe("cloudflared.service"),
        unit_probe("xray.service"),
    ])
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "host": host_probe(),
        "services": services,
    }


class SnapshotCache:
    def __init__(self, ttl_seconds: float = 5.0) -> None:
        self.ttl_seconds = ttl_seconds
        self.expires_at = 0.0
        self.value: dict[str, object] | None = None
        self.lock = threading.Lock()

    def read(self) -> dict[str, object]:
        now = time.monotonic()
        if self.value is not None and now < self.expires_at:
            return self.value
        with self.lock:
            now = time.monotonic()
            if self.value is None or now >= self.expires_at:
                self.value = build_snapshot()
                self.expires_at = now + self.ttl_seconds
            return self.value


CACHE = SnapshotCache()


class StatusHandler(BaseHTTPRequestHandler):
    server_version = "hkvps-status"
    sys_version = ""

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        if self.path == "/health":
            self._send(200, {"status": "ok"})
            return
        if self.path != "/status":
            self._send(404, {"error": "not_found"})
            return
        try:
            self._send(200, CACHE.read())
        except Exception:
            self._send(503, {"error": "probe_failed"})

    def _send(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "private, max-age=3")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    address = os.environ.get("HKVPS_EXPORTER_LISTEN", "100.122.69.109")
    port = int(os.environ.get("HKVPS_EXPORTER_PORT", "9126"))
    server = ThreadingHTTPServer((address, port), StatusHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
