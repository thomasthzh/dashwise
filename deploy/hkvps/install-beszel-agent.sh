#!/usr/bin/env bash
set -Eeuo pipefail

beszel_version=0.18.7
agent_archive=/tmp/beszel-agent_linux_amd64.tar.gz
agent_token_source=/tmp/beszel-agent-token
agent_key_source=/tmp/beszel-agent-key
agent_sha256=4ae327aac5ad5a231845b0ef613066d555bbe52f7ecb2f28a53d07c04e689aff
agent_root=/opt/beszel-agent-hkvps
agent_binary=${agent_root}/beszel-agent-${beszel_version}
state_root=/var/lib/beszel-agent-hkvps
config_root=/etc/beszel-agent-hkvps
token_file=${config_root}/token
key_file=${config_root}/key
service_file=/etc/systemd/system/beszel-agent-hkvps.service

if [[ ${EUID} -ne 0 ]]; then
  printf '%s\n' 'ERROR: run this installer as root' >&2
  exit 1
fi
printf '%s  %s\n' "${agent_sha256}" "${agent_archive}" | sha256sum -c -
[[ -s ${agent_token_source} || -s ${token_file} ]] \
  || { printf 'ERROR: missing %s and %s\n' "${agent_token_source}" "${token_file}" >&2; exit 1; }
[[ -s ${agent_key_source} || -s ${key_file} ]] \
  || { printf 'ERROR: missing %s and %s\n' "${agent_key_source}" "${key_file}" >&2; exit 1; }

staging_root=$(mktemp -d /tmp/beszel-agent-hkvps-install.XXXXXX)
case ${staging_root} in
  /tmp/beszel-agent-hkvps-install.*) ;;
  *) printf 'ERROR: unsafe staging path: %s\n' "${staging_root}" >&2; exit 1 ;;
esac
cleanup() {
  if [[ -d ${staging_root} ]]; then
    rm -rf --one-file-system -- "${staging_root}"
  fi
  for transfer_file in "${agent_token_source}" "${agent_key_source}"; do
    if [[ -e ${transfer_file} || -L ${transfer_file} ]]; then
      if [[ -f ${transfer_file} && ! -L ${transfer_file} ]]; then
        rm -f -- "${transfer_file}"
      else
        printf 'WARNING: refusing to remove unexpected transfer path: %s\n' "${transfer_file}" >&2
      fi
    fi
  done
}
trap cleanup EXIT

if ! id -u beszel >/dev/null 2>&1; then
  useradd --system --home-dir "${state_root}" --shell /usr/sbin/nologin beszel
fi
install -d -m 0755 -o root -g root "${agent_root}"
install -d -m 0750 -o beszel -g beszel "${state_root}"
install -d -m 0750 -o root -g beszel "${config_root}"
tar -xzf "${agent_archive}" -C "${staging_root}" beszel-agent
install -m 0755 -o root -g root "${staging_root}/beszel-agent" "${agent_binary}"
ln -sfn "beszel-agent-${beszel_version}" "${agent_root}/beszel-agent"
if [[ -s ${agent_token_source} ]]; then
  install -m 0640 -o root -g beszel "${agent_token_source}" "${token_file}"
fi
if [[ -s ${agent_key_source} ]]; then
  grep -Eq '^ssh-ed25519 ' "${agent_key_source}" \
    || { printf '%s\n' 'ERROR: Beszel hub public key is invalid' >&2; exit 1; }
  install -m 0640 -o root -g beszel "${agent_key_source}" "${key_file}"
fi

unit_stage=${staging_root}/beszel-agent-hkvps.service
cat >"${unit_stage}" <<EOF
[Unit]
Description=Beszel Agent for hkvps
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=beszel
Group=beszel
WorkingDirectory=${state_root}
Environment=LISTEN=127.0.0.1:45876
Environment=HUB_URL=http://100.80.188.111:8091
Environment=KEY_FILE=/etc/beszel-agent-hkvps/key
Environment=TOKEN_FILE=/etc/beszel-agent-hkvps/token
Environment=SYSTEM_NAME=hkvps
Environment=DISABLE_SSH=true
Environment=DOCKER_HOST=
Environment=SERVICE_PATTERNS=AdGuardHome*,moonlight-blog*,netwatch-dashboard*,service-hub*,weiqi*,caddy*,cloudflared*,netdata*,xray*,docker*,mariadb*
ExecStart=${agent_root}/beszel-agent
Restart=on-failure
RestartSec=5s
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectClock=true
ProtectControlGroups=true
ProtectHome=true
ProtectHostname=true
ProtectKernelLogs=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectSystem=strict
ReadOnlyPaths=${key_file} ${token_file}
ReadWritePaths=${state_root}
RemoveIPC=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF
install -m 0644 -o root -g root "${unit_stage}" "${service_file}"

systemctl daemon-reload
systemctl enable beszel-agent-hkvps.service
systemctl restart beszel-agent-hkvps.service
sleep 2
systemctl is-active --quiet beszel-agent-hkvps.service
printf 'Beszel %s agent for hkvps is active.\n' "${beszel_version}"
