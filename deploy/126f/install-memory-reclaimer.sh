#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

expected_board='B760M GAMING PLUS WIFI DDR4 II (MS-7D99)'
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
source_script=$script_dir/reclaim-memory.sh
target_script=/usr/local/sbin/dashwise-reclaim-memory
state_root=/var/lib/dashwise/memory-reclaim
service_file=/etc/systemd/system/dashwise-memory-reclaim.service
path_file=/etc/systemd/system/dashwise-memory-reclaim.path
legacy_sudoers=/etc/sudoers.d/dashwise-memory-reclaim
unit_stage=

cleanup() {
  [[ -z "$unit_stage" || ! -d "$unit_stage" || -L "$unit_stage" ]] && return
  rm -f -- "$unit_stage/dashwise-memory-reclaim.service" "$unit_stage/dashwise-memory-reclaim.path"
  rmdir -- "$unit_stage"
}
trap cleanup EXIT

[[ ${EUID:-$(id -u)} == 0 ]] || {
  printf 'ERROR: run as root\n' >&2
  exit 1
}
[[ -r /sys/class/dmi/id/board_name && $(< /sys/class/dmi/id/board_name) == "$expected_board" ]] || {
  printf 'ERROR: unexpected board model\n' >&2
  exit 1
}
id dashwise >/dev/null
for command in install mktemp systemctl; do
  command -v "$command" >/dev/null || {
    printf 'ERROR: %s is not installed\n' "$command" >&2
    exit 1
  }
done
[[ -f "$source_script" && ! -L "$source_script" ]] || {
  printf 'ERROR: reclaim script is missing or unsafe\n' >&2
  exit 1
}
if [[ -e "$legacy_sudoers" || -L "$legacy_sudoers" ]]; then
  [[ -f "$legacy_sudoers" && ! -L "$legacy_sudoers"
    && $(stat -c '%U:%G:%a' "$legacy_sudoers") == root:root:440
    && $(< "$legacy_sudoers") == 'dashwise ALL=(root) NOPASSWD: /usr/local/sbin/dashwise-reclaim-memory' ]] || {
    printf 'ERROR: legacy sudoers file is unsafe\n' >&2
    exit 1
  }
  rm -f -- "$legacy_sudoers"
fi

install -o root -g root -m 0755 "$source_script" "$target_script"
install -d -o dashwise -g dashwise -m 0750 "$state_root"

unit_stage=$(mktemp -d /run/dashwise-memory-reclaimer.XXXXXX)
cat >"$unit_stage/dashwise-memory-reclaim.service" <<'UNIT'
[Unit]
Description=Dashwise one-shot memory cache reclaim

[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/local/sbin/dashwise-reclaim-memory
UMask=0027
NoNewPrivileges=true
PrivateDevices=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadOnlyPaths=/proc/sys
ReadWritePaths=/proc/sys/vm/drop_caches /var/lib/dashwise/memory-reclaim
RestrictAddressFamilies=AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
UNIT
cat >"$unit_stage/dashwise-memory-reclaim.path" <<'UNIT'
[Unit]
Description=Watch for Dashwise memory reclaim requests

[Path]
PathChanged=/var/lib/dashwise/memory-reclaim/request
Unit=dashwise-memory-reclaim.service

[Install]
WantedBy=multi-user.target
UNIT
install -o root -g root -m 0644 "$unit_stage/dashwise-memory-reclaim.service" "$service_file"
install -o root -g root -m 0644 "$unit_stage/dashwise-memory-reclaim.path" "$path_file"
systemctl daemon-reload
systemctl enable --now dashwise-memory-reclaim.path

printf 'Dashwise memory reclaimer installed\n'
