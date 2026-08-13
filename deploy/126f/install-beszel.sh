#!/usr/bin/env bash
set -Eeuo pipefail

beszel_version=0.18.7
hub_archive=/tmp/beszel_linux_amd64.tar.gz
agent_archive=/tmp/beszel-agent_linux_amd64.tar.gz
hub_sha256=b75c52a82af5c9721f08a7a9cb0c16df27e81967a3855cef7c77dbad9fb43524
agent_sha256=4ae327aac5ad5a231845b0ef613066d555bbe52f7ecb2f28a53d07c04e689aff
hub_root=/opt/beszel-126f
hub_binary=${hub_root}/beszel-${beszel_version}
agent_root=/opt/beszel-agent-126f
agent_binary=${agent_root}/beszel-agent-${beszel_version}
config_root=/etc/beszel-126f
token_file=${config_root}/agent-token
key_file=${config_root}/agent-key
hub_private_key=/var/lib/beszel-126f/beszel_data/id_ed25519
hub_service=/etc/systemd/system/beszel-126f.service
agent_service=/etc/systemd/system/beszel-agent-126f.service

if [[ ${EUID} -ne 0 ]]; then
  printf '%s\n' 'ERROR: run this installer through sudo' >&2
  exit 1
fi

printf '%s  %s\n' "${hub_sha256}" "${hub_archive}" | sha256sum -c -
printf '%s  %s\n' "${agent_sha256}" "${agent_archive}" | sha256sum -c -

staging_root=$(mktemp -d /tmp/beszel-126f-install.XXXXXX)
case ${staging_root} in
  /tmp/beszel-126f-install.*) ;;
  *) printf 'ERROR: unsafe staging path: %s\n' "${staging_root}" >&2; exit 1 ;;
esac
cleanup() {
  if [[ -d ${staging_root} ]]; then
    rm -rf --one-file-system -- "${staging_root}"
  fi
}
trap cleanup EXIT

if ! id -u beszel >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/beszel-126f --shell /usr/sbin/nologin beszel
fi
install -d -m 0755 -o root -g root "${hub_root}" "${agent_root}"
install -d -m 0750 -o beszel -g beszel /var/lib/beszel-126f /var/lib/beszel-agent-126f
install -d -m 0750 -o root -g beszel "${config_root}"

tar -xzf "${hub_archive}" -C "${staging_root}" beszel
tar -xzf "${agent_archive}" -C "${staging_root}" beszel-agent
install -m 0755 -o root -g root "${staging_root}/beszel" "${hub_binary}"
install -m 0755 -o root -g root "${staging_root}/beszel-agent" "${agent_binary}"
ln -sfn "beszel-${beszel_version}" "${hub_root}/beszel"
ln -sfn "beszel-agent-${beszel_version}" "${agent_root}/beszel-agent"

if [[ ! -f ${token_file} ]]; then
  token_stage=${staging_root}/agent-token
  umask 0077
  openssl rand -hex 32 >"${token_stage}"
  install -m 0640 -o root -g beszel "${token_stage}" "${token_file}"
fi

hub_unit=${staging_root}/beszel-126f.service
cat >"${hub_unit}" <<EOF
[Unit]
Description=Beszel Hub for 126f
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=beszel
Group=beszel
WorkingDirectory=/var/lib/beszel-126f
Environment=APP_URL=http://100.80.188.111:8091
Environment=CHECK_UPDATES=false
ExecStart=${hub_root}/beszel serve --http "0.0.0.0:8091"
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
ReadWritePaths=/var/lib/beszel-126f
RemoveIPC=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF
install -m 0644 -o root -g root "${hub_unit}" "${hub_service}"

agent_unit=${staging_root}/beszel-agent-126f.service
cat >"${agent_unit}" <<EOF
[Unit]
Description=Beszel Agent for 126f
After=network-online.target beszel-126f.service
Wants=network-online.target

[Service]
Type=simple
User=beszel
Group=beszel
WorkingDirectory=/var/lib/beszel-agent-126f
Environment=LISTEN=127.0.0.1:45876
Environment=HUB_URL=http://127.0.0.1:8091
Environment=KEY_FILE=/etc/beszel-126f/agent-key
Environment=TOKEN_FILE=/etc/beszel-126f/agent-token
Environment=DISABLE_SSH=true
Environment=DOCKER_HOST=
Environment=SERVICE_PATTERNS=dashwise-126f*,beszel-126f*,beszel-agent-126f*,mcsm-*,mihomo*,npc*,deepseek-harness*
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
ReadOnlyPaths=/etc/beszel-126f/agent-key /etc/beszel-126f/agent-token
ReadWritePaths=/var/lib/beszel-agent-126f
RemoveIPC=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF
install -m 0644 -o root -g root "${agent_unit}" "${agent_service}"

systemctl daemon-reload
systemctl enable --now beszel-126f.service

healthy=false
for _ in $(seq 1 30); do
  if "${hub_root}/beszel" health --url http://127.0.0.1:8091 >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 1
done
[[ ${healthy} == true ]] || { printf '%s\n' 'ERROR: Beszel hub failed health verification' >&2; exit 1; }

[[ -s ${hub_private_key} ]] || { printf 'ERROR: missing Beszel hub key: %s\n' "${hub_private_key}" >&2; exit 1; }
key_stage=${staging_root}/agent-key
ssh-keygen -y -f "${hub_private_key}" >"${key_stage}"
grep -Eq '^ssh-ed25519 ' "${key_stage}" \
  || { printf '%s\n' 'ERROR: Beszel hub public key is invalid' >&2; exit 1; }
install -m 0640 -o root -g beszel "${key_stage}" "${key_file}"

systemctl enable --now beszel-agent-126f.service
systemctl is-active --quiet beszel-126f.service
systemctl is-active --quiet beszel-agent-126f.service
printf 'Beszel %s hub and local agent are active.\n' "${beszel_version}"
