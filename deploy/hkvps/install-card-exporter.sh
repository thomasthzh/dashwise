#!/usr/bin/env bash
set -Eeuo pipefail

source_file=/tmp/card_exporter.py
source_sha256=3247db1f420112ea26a330191321a16fdb0decec31e9104ebc0398cf21d73eb3
app_root=/opt/hkvps-status
state_root=/var/lib/hkvps-status
service_file=/etc/systemd/system/hkvps-card-exporter.service

if [[ ${EUID} -ne 0 ]]; then
  printf '%s\n' 'ERROR: run this installer as root' >&2
  exit 1
fi
printf '%s  %s\n' "${source_sha256}" "${source_file}" | sha256sum -c -
/usr/bin/python3 -m py_compile "${source_file}"

if ! id -u hkvps-status >/dev/null 2>&1; then
  useradd --system --home-dir "${state_root}" --shell /usr/sbin/nologin hkvps-status
fi
install -d -m 0755 -o root -g root "${app_root}"
install -d -m 0750 -o hkvps-status -g hkvps-status "${state_root}"
install -m 0755 -o root -g root "${source_file}" "${app_root}/card_exporter.py"

staging_root=$(mktemp -d /tmp/hkvps-card-exporter-install.XXXXXX)
case ${staging_root} in
  /tmp/hkvps-card-exporter-install.*) ;;
  *) printf 'ERROR: unsafe staging path: %s\n' "${staging_root}" >&2; exit 1 ;;
esac
cleanup() {
  if [[ -d ${staging_root} ]]; then
    rm -rf --one-file-system -- "${staging_root}"
  fi
}
trap cleanup EXIT

unit_stage=${staging_root}/hkvps-card-exporter.service
cat >"${unit_stage}" <<'EOF'
[Unit]
Description=Tailnet-only hkvps card exporter for 126f
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=hkvps-status
Group=hkvps-status
WorkingDirectory=/var/lib/hkvps-status
Environment=HKVPS_EXPORTER_LISTEN=100.122.69.109
Environment=HKVPS_EXPORTER_PORT=9126
ExecStart=/usr/bin/python3 /opt/hkvps-status/card_exporter.py
Restart=on-failure
RestartSec=5s
UMask=0027
NoNewPrivileges=true
PrivateDevices=true
PrivateTmp=true
ProtectClock=true
ProtectControlGroups=true
ProtectHome=true
ProtectHostname=true
ProtectKernelLogs=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectSystem=strict
ReadWritePaths=/var/lib/hkvps-status
RemoveIPC=true
RestrictAddressFamilies=AF_INET AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
IPAddressDeny=any
IPAddressAllow=localhost
IPAddressAllow=100.64.0.0/10

[Install]
WantedBy=multi-user.target
EOF
install -m 0644 -o root -g root "${unit_stage}" "${service_file}"

systemctl daemon-reload
systemctl enable --now hkvps-card-exporter.service

healthy=false
for _ in $(seq 1 20); do
  if curl --noproxy '*' --fail --silent --show-error --max-time 2 \
    http://100.122.69.109:9126/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done
[[ ${healthy} == true ]] || { printf '%s\n' 'ERROR: hkvps card exporter failed health verification' >&2; exit 1; }
systemctl is-active --quiet hkvps-card-exporter.service
printf '%s\n' 'hkvps card exporter is active on Tailnet TCP 9126.'
