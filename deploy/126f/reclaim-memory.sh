#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID:-$(id -u)} == 0 ]] || {
  printf 'ERROR: run as root\n' >&2
  exit 1
}

exec 9>/run/lock/dashwise-reclaim-memory.lock
flock -n 9 || {
  printf 'ERROR: memory reclaim is already running\n' >&2
  exit 75
}

state_root=/var/lib/dashwise/memory-reclaim
request_file=$state_root/request
result_file=$state_root/result.json
result_stage=

cleanup() {
  [[ -z "$result_stage" || ! -e "$result_stage" ]] || rm -f -- "$result_stage"
}
trap cleanup EXIT

[[ -d "$state_root" && ! -L "$state_root" ]] || {
  printf 'ERROR: memory reclaim state directory is unsafe\n' >&2
  exit 1
}
[[ -f "$request_file" && ! -L "$request_file" ]] || {
  printf 'ERROR: memory reclaim request is missing or unsafe\n' >&2
  exit 1
}
request_id=$(tr -d '\r\n' <"$request_file")
[[ "$request_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || {
  printf 'ERROR: memory reclaim request is invalid\n' >&2
  exit 1
}

read_reclaimable_kib() {
  awk '
    /^Buffers:/ { buffers = $2 }
    /^Cached:/ { cached = $2 }
    /^SReclaimable:/ { reclaimable = $2 }
    /^Shmem:/ { shared = $2 }
    END {
      total = buffers + cached + reclaimable - shared
      printf "%.0f\n", total > 0 ? total : 0
    }
  ' /proc/meminfo
}

before_kib=$(read_reclaimable_kib)
sync
printf '3\n' >/proc/sys/vm/drop_caches
after_kib=$(read_reclaimable_kib)

reclaimed_kib=$((before_kib - after_kib))
(( reclaimed_kib > 0 )) || reclaimed_kib=0
result_stage=$(mktemp "$state_root/.result.XXXXXX")
printf '{"requestId":"%s","reclaimedBytes":%d,"completedAt":"%s"}\n' \
  "$request_id" "$((reclaimed_kib * 1024))" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$result_stage"
chown root:dashwise "$result_stage"
chmod 0640 "$result_stage"
mv -Tf -- "$result_stage" "$result_file"
result_stage=
