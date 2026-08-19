#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

expected_board='B760M GAMING PLUS WIFI DDR4 II (MS-7D99)'
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
source_script=$script_dir/reclaim-memory.sh
target_script=/usr/local/sbin/dashwise-reclaim-memory
sudoers_file=/etc/sudoers.d/dashwise-memory-reclaim
sudoers_stage=

cleanup() {
  [[ -z "$sudoers_stage" || ! -e "$sudoers_stage" ]] || rm -f -- "$sudoers_stage"
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
for command in install mktemp visudo; do
  command -v "$command" >/dev/null || {
    printf 'ERROR: %s is not installed\n' "$command" >&2
    exit 1
  }
done
[[ -f "$source_script" && ! -L "$source_script" ]] || {
  printf 'ERROR: reclaim script is missing or unsafe\n' >&2
  exit 1
}
if [[ -e "$sudoers_file" || -L "$sudoers_file" ]]; then
  [[ -f "$sudoers_file" && ! -L "$sudoers_file" ]] || {
    printf 'ERROR: sudoers target is unsafe\n' >&2
    exit 1
  }
fi

install -o root -g root -m 0755 "$source_script" "$target_script"
sudoers_stage=$(mktemp /etc/sudoers.d/.dashwise-memory-reclaim.XXXXXX)
printf '%s\n' 'dashwise ALL=(root) NOPASSWD: /usr/local/sbin/dashwise-reclaim-memory' >"$sudoers_stage"
chmod 0440 "$sudoers_stage"
visudo -cf "$sudoers_stage" >/dev/null
install -o root -g root -m 0440 "$sudoers_stage" "$sudoers_file"
rm -f -- "$sudoers_stage"
sudoers_stage=

printf 'Dashwise memory reclaimer installed\n'
