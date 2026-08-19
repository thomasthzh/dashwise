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
printf '{"reclaimedBytes":%d,"completedAt":"%s"}\n' \
  "$((reclaimed_kib * 1024))" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
