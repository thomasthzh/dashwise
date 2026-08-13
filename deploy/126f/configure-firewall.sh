#!/usr/bin/env bash
set -Eeuo pipefail

config=/etc/nftables.conf
rule='    iifname "tailscale0" tcp dport { 3000, 8091 } accept comment "Tailscale Dashwise and Beszel"'
anchor='    iifname "tailscale0" tcp dport 22 accept comment "Tailscale rescue SSH"'
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir=/var/backups/126f/nftables
backup=${backup_dir}/nftables.conf.${stamp}
candidate=
persistent_changed=false
live_changed=false
added_handle=
config_mode=
config_uid=
config_gid=

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

matching_live_handles() {
  nft -a list chain inet filter input | awk '
    /iifname "tailscale0" tcp dport \{ 3000, 8091 \} accept comment "Tailscale Dashwise and Beszel"/ {
      print $NF
    }
  '
}

matching_live_anchor_handles() {
  nft -a list chain inet filter input | awk '
    /iifname "tailscale0" tcp dport 22 accept comment "Tailscale rescue SSH"/ {
      print $NF
    }
  '
}

cleanup_candidate() {
  if [[ ${candidate} == /etc/.nftables.conf.* && -f ${candidate} && ! -L ${candidate} ]]; then
    rm -f -- "${candidate}"
  fi
}

rollback() {
  local -a handles
  if [[ ${live_changed} == true ]]; then
    mapfile -t handles < <(matching_live_handles)
    if [[ ${#handles[@]} == 1 && ${handles[0]} =~ ^[1-9][0-9]*$ ]]; then
      added_handle=${handles[0]}
      nft delete rule inet filter input handle "${added_handle}" || true
    fi
  fi
  if [[ ${persistent_changed} == true ]]; then
    install -o "${config_uid}" -g "${config_gid}" -m "${config_mode}" "${backup}" "${config}"
  fi
  cleanup_candidate
}

[[ ${EUID:-$(id -u)} == 0 ]] || die 'run as root'
[[ -f ${config} && ! -L ${config} && $(realpath -e "${config}") == /etc/nftables.conf ]] \
  || die 'unexpected nftables config path'
config_mode=$(stat -c '%a' "${config}")
config_uid=$(stat -c '%u' "${config}")
config_gid=$(stat -c '%g' "${config}")
[[ ${config_mode} =~ ^[0-7]{3,4}$ && ${config_uid} =~ ^[0-9]+$ && ${config_gid} =~ ^[0-9]+$ ]] \
  || die 'unexpected nftables config metadata'
nft list chain inet filter input >/dev/null || die 'expected inet filter input chain is missing'
ss -lntH | grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\*|\[::\]):3000([[:space:]]|$)' \
  || die 'dashboard listener on TCP 3000 is missing'
ss -lntH | grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\*|\[::\]):8091([[:space:]]|$)' \
  || die 'Beszel listener on TCP 8091 is missing'

config_count=$(grep -Fxc "${rule}" "${config}" || true)
[[ ${config_count} == 0 || ${config_count} == 1 ]] \
  || die 'persistent dashboard rule is duplicated'
mapfile -t live_handles < <(matching_live_handles)
[[ ${#live_handles[@]} -le 1 ]] || die 'live dashboard rule is duplicated'

install -d -o root -g root -m 0700 "${backup_dir}"
trap rollback EXIT

if [[ ${config_count} == 0 ]]; then
  [[ $(grep -Fxc "${anchor}" "${config}" || true) == 1 ]] \
    || die 'expected Tailscale SSH anchor rule is missing or duplicated'
  install -o root -g root -m 0700 "${config}" "${backup}"
  candidate=$(mktemp /etc/.nftables.conf.XXXXXX)
  awk -v anchor="${anchor}" -v rule="${rule}" '
    $0 == rule { next }
    { print; if ($0 == anchor) print rule }
  ' "${config}" >"${candidate}"
  chmod "${config_mode}" "${candidate}"
  [[ $(grep -Fxc "${rule}" "${candidate}" || true) == 1 ]] \
    || die 'candidate did not contain exactly one dashboard rule'
  nft -c -f "${candidate}"
  persistent_changed=true
  install -o "${config_uid}" -g "${config_gid}" -m "${config_mode}" "${candidate}" "${config}"
fi

if [[ ${#live_handles[@]} == 0 ]]; then
  mapfile -t anchor_handles < <(matching_live_anchor_handles)
  [[ ${#anchor_handles[@]} == 1 && ${anchor_handles[0]} =~ ^[1-9][0-9]*$ ]] \
    || die 'live Tailscale SSH anchor rule is missing or duplicated'
  anchor_handle=${anchor_handles[0]}
  nft "add rule inet filter input handle ${anchor_handle} iifname \"tailscale0\" tcp dport { 3000, 8091 } accept comment \"Tailscale Dashwise and Beszel\""
  live_changed=true
fi

[[ $(grep -Fxc "${rule}" "${config}" || true) == 1 ]] \
  || die 'persistent dashboard rule verification failed'
mapfile -t live_handles < <(matching_live_handles)
[[ ${#live_handles[@]} == 1 && ${live_handles[0]} =~ ^[1-9][0-9]*$ ]] \
  || die 'live dashboard rule verification failed'

persistent_changed=false
live_changed=false
trap - EXIT
cleanup_candidate
printf '%s\n' 'Dashwise and Beszel are allowed only through tailscale0.'
