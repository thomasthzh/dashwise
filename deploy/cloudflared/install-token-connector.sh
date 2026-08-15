#!/usr/bin/env bash
set -Eeuo pipefail

instance=${1:-}
case ${instance} in
  syncaction | homepage) ;;
  *)
    printf '%s\n' 'ERROR: instance must be syncaction or homepage' >&2
    exit 2
    ;;
esac

if [[ ${EUID} -ne 0 ]]; then
  printf '%s\n' 'ERROR: run this installer as root' >&2
  exit 1
fi

script_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
validator="${script_root}/validate-token.py"
token_source="/tmp/cloudflared-${instance}.token"
config_root="/etc/cloudflared-${instance}"
token_file="${config_root}/token"
unit_name="cloudflared-${instance}.service"
service_file="/etc/systemd/system/${unit_name}"

service_is_running() {
  local active_state sub_state
  active_state=$(systemctl show --property=ActiveState --value "${unit_name}" 2>/dev/null || true)
  sub_state=$(systemctl show --property=SubState --value "${unit_name}" 2>/dev/null || true)
  [[ ${active_state} == active && ${sub_state} == running ]]
}

[[ -x ${validator} ]] || {
  printf '%s\n' 'ERROR: token validator is missing or not executable' >&2
  exit 1
}
"${validator}" "${token_source}"

cloudflared_bin=$(command -v cloudflared || true)
case ${cloudflared_bin} in
  /usr/bin/cloudflared | /usr/local/bin/cloudflared) ;;
  *)
    printf '%s\n' 'ERROR: cloudflared is missing from an approved system path' >&2
    exit 1
    ;;
esac

staging_root=$(mktemp -d /tmp/cloudflared-connector-install.XXXXXX)
case ${staging_root} in
  /tmp/cloudflared-connector-install.*) ;;
  *)
    printf 'ERROR: unsafe staging path: %s\n' "${staging_root}" >&2
    exit 1
    ;;
esac

unit_stage="${staging_root}/${unit_name}"
token_stage="${staging_root}/token"
install -m 0600 "${token_source}" "${token_stage}"

cat >"${unit_stage}" <<EOF
[Unit]
Description=Cloudflare Tunnel connector for ${instance}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
DynamicUser=yes
LoadCredential=cloudflared-token:${token_file}
ExecStart=${cloudflared_bin} --no-autoupdate tunnel run --token-file %d/cloudflared-token
Restart=on-failure
RestartSec=5s
TimeoutStartSec=30s
UMask=0077
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
RemoveIPC=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

unit_existed=false
token_existed=false
config_root_created=false
was_enabled=false
was_active=false
mutation_started=false
install_succeeded=false

if [[ -e ${service_file} ]]; then
  unit_existed=true
  cp -a -- "${service_file}" "${staging_root}/previous-unit"
fi
if [[ -e ${token_file} ]]; then
  token_existed=true
  cp -a -- "${token_file}" "${staging_root}/previous-token"
fi
if [[ ! -d ${config_root} ]]; then
  config_root_created=true
fi
if systemctl is-enabled --quiet "${unit_name}" 2>/dev/null; then
  was_enabled=true
fi
if service_is_running; then
  was_active=true
fi

cleanup() {
  if [[ -d ${staging_root} ]]; then
    rm -rf --one-file-system -- "${staging_root}"
  fi
}

rollback() {
  exit_code=$?
  trap - ERR
  set +e
  if [[ ${mutation_started} == true && ${install_succeeded} != true ]]; then
    systemctl disable --now "${unit_name}" >/dev/null 2>&1
    if [[ ${unit_existed} == true ]]; then
      install -m 0644 -o root -g root "${staging_root}/previous-unit" "${service_file}"
    else
      rm -f -- "${service_file}"
    fi
    if [[ ${token_existed} == true ]]; then
      install -m 0600 -o root -g root "${staging_root}/previous-token" "${token_file}"
    else
      rm -f -- "${token_file}"
    fi
    if [[ ${config_root_created} == true ]]; then
      rmdir -- "${config_root}" 2>/dev/null
    fi
    systemctl daemon-reload
    if [[ ${was_enabled} == true ]]; then
      systemctl enable "${unit_name}" >/dev/null 2>&1
    fi
    if [[ ${was_active} == true ]]; then
      systemctl start "${unit_name}" >/dev/null 2>&1
    fi
  fi
  cleanup
  exit "${exit_code}"
}

trap cleanup EXIT
trap rollback ERR

mutation_started=true
install -d -m 0700 "${config_root}"
install -m 0600 -o root -g root "${token_stage}" "${token_file}"
install -m 0644 -o root -g root "${unit_stage}" "${service_file}"
systemctl daemon-reload
systemctl enable "${unit_name}" >/dev/null
systemctl restart "${unit_name}"

healthy=false
for _ in $(seq 1 20); do
  if service_is_running; then
    healthy=true
    break
  fi
  sleep 1
done
[[ ${healthy} == true ]] || {
  printf 'ERROR: %s did not become active and running\n' "${unit_name}" >&2
  false
}

install_succeeded=true
trap - ERR
if command -v shred >/dev/null 2>&1; then
  shred -u -- "${token_source}"
else
  rm -f -- "${token_source}"
fi
printf '%s is active.\n' "${unit_name}"
