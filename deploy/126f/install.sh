#!/usr/bin/env bash
set -euo pipefail

[[ ${EUID} -eq 0 ]] || { printf '%s\n' 'ERROR: run as root' >&2; exit 1; }

app_root=/opt/dashwise-126f
release_root=${app_root}/releases
bin_root=${app_root}/bin
state_root=/var/lib/dashwise
config_root=/etc/dashwise
config_file=${config_root}/126f.env
service_file=/etc/systemd/system/dashwise-126f.service
repo_url=https://github.com/thomasthzh/dashwise.git
branch=codex/126f-liquid-dashboard
bun_version=1.3.14
pocketbase_version=0.30.4
bun_sha256=951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f
pocketbase_sha256=d62a9247e775c59fa1ef5154f43a0bd868c6bfb2bcee5cdeef05cf14f657bc83
runtime_cache_dir=${DASHWISE_RUNTIME_CACHE_DIR:-}
git_proxy_url=${DASHWISE_GIT_PROXY_URL:-}
source_archive=${DASHWISE_SOURCE_ARCHIVE:-}
source_archive_sha256=${DASHWISE_SOURCE_ARCHIVE_SHA256:-}
git_network_args=()
if [[ -n ${git_proxy_url} ]]; then
  git_network_args+=(-c "http.proxy=${git_proxy_url}")
fi

staging_root=$(mktemp -d /tmp/dashwise-126f-install.XXXXXX)
case ${staging_root} in
  /tmp/dashwise-126f-install.*) ;;
  *) printf 'ERROR: unsafe staging path: %s\n' "${staging_root}" >&2; exit 1 ;;
esac
cleanup() {
  case ${staging_root:-} in
    /tmp/dashwise-126f-install.*) rm -rf -- "${staging_root:?}" ;;
  esac
}
trap cleanup EXIT

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  build-essential ca-certificates curl git openssl python3 tar unzip valkey-server

if ! id -u dashwise >/dev/null 2>&1; then
  useradd --system --home-dir "${state_root}" --shell /usr/sbin/nologin dashwise
fi

install -d -m 0755 -o root -g root "${app_root}" "${release_root}" "${bin_root}" "${config_root}"
install -d -m 0750 -o dashwise -g dashwise "${state_root}" "${state_root}/pb_data"

download_and_verify() {
  local url=$1
  local output=$2
  local expected_hash=$3
  local cache_file=${4:-}
  if [[ -n ${cache_file} && -f ${cache_file} ]]; then
    cp -- "${cache_file}" "${output}"
  else
    curl --ipv4 --fail --location --silent --show-error --retry 3 \
      --connect-timeout 15 --max-time 900 --output "${output}" "${url}"
  fi
  printf '%s  %s\n' "${expected_hash}" "${output}" | sha256sum -c -
}

bun_zip=${staging_root}/bun.zip
download_and_verify \
  "https://github.com/oven-sh/bun/releases/download/bun-v${bun_version}/bun-linux-x64.zip" \
  "${bun_zip}" \
  "${bun_sha256}" \
  "${runtime_cache_dir:+${runtime_cache_dir}/bun-linux-x64.zip}"
unzip -q "${bun_zip}" -d "${staging_root}/bun"
install -m 0755 -o root -g root "${staging_root}/bun/bun-linux-x64/bun" "${bin_root}/bun-${bun_version}"
ln -sfn "bun-${bun_version}" "${bin_root}/bun"
ln -sfn bun "${bin_root}/bunx"
export PATH="${bin_root}:${PATH}"

pocketbase_zip=${staging_root}/pocketbase.zip
download_and_verify \
  "https://github.com/pocketbase/pocketbase/releases/download/v${pocketbase_version}/pocketbase_${pocketbase_version}_linux_amd64.zip" \
  "${pocketbase_zip}" \
  "${pocketbase_sha256}" \
  "${runtime_cache_dir:+${runtime_cache_dir}/pocketbase_linux_amd64.zip}"
unzip -q "${pocketbase_zip}" -d "${staging_root}/pocketbase"
install -m 0755 -o root -g root "${staging_root}/pocketbase/pocketbase" "${bin_root}/pocketbase-${pocketbase_version}"
ln -sfn "pocketbase-${pocketbase_version}" "${bin_root}/pocketbase"

source_dir=${staging_root}/source
if [[ -n ${source_archive} || -n ${source_archive_sha256} ]]; then
  [[ -f ${source_archive} && ${source_archive_sha256} =~ ^[0-9a-f]{64}$ ]] \
    || { printf '%s\n' 'ERROR: source archive and SHA-256 must both be valid' >&2; exit 1; }
  printf '%s  %s\n' "${source_archive_sha256}" "${source_archive}" | sha256sum -c -
  install -d "${source_dir}"
  tar -xzf "${source_archive}" -C "${source_dir}"
  [[ -f ${source_dir}/.dashwise-source-commit ]] \
    || { printf '%s\n' 'ERROR: source archive is missing its commit marker' >&2; exit 1; }
  remote_commit=$(<"${source_dir}/.dashwise-source-commit")
  rm -- "${source_dir}/.dashwise-source-commit"
else
  remote_commit=$(git "${git_network_args[@]}" ls-remote "${repo_url}" "refs/heads/${branch}" | awk 'NR == 1 { print $1 }')
fi
[[ ${remote_commit} =~ ^[0-9a-f]{40}$ ]] || { printf '%s\n' 'ERROR: could not resolve deployment commit' >&2; exit 1; }
release_dir=${release_root}/${remote_commit}
case ${release_dir} in
  /opt/dashwise-126f/releases/[0-9a-f]*) ;;
  *) printf 'ERROR: unsafe release path: %s\n' "${release_dir}" >&2; exit 1 ;;
esac
release_marker=${release_dir}/.dashwise-release-complete

if [[ -d ${release_dir} && ! -f ${release_marker} ]]; then
  failed_release_dir=${release_root}/failed-${remote_commit}-$(date -u +%Y%m%dT%H%M%SZ)
  case ${failed_release_dir} in
    /opt/dashwise-126f/releases/failed-[0-9a-f]*-[0-9]*Z) ;;
    *) printf 'ERROR: unsafe failed release path: %s\n' "${failed_release_dir}" >&2; exit 1 ;;
  esac
  [[ ! -e ${failed_release_dir} ]] \
    || { printf 'ERROR: failed release path already exists: %s\n' "${failed_release_dir}" >&2; exit 1; }
  mv -- "${release_dir}" "${failed_release_dir}"
fi

if [[ ! -d ${release_dir} ]]; then
  if [[ -z ${source_archive} ]]; then
    git "${git_network_args[@]}" clone --depth 1 --single-branch --branch "${branch}" "${repo_url}" "${source_dir}"
    [[ $(git -C "${source_dir}" rev-parse HEAD) == "${remote_commit}" ]] \
      || { printf '%s\n' 'ERROR: cloned commit does not match remote branch' >&2; exit 1; }
  fi

  ln -s "${state_root}/pb_data" "${source_dir}/pocketbase/pb_data"
  (
    cd "${source_dir}"
    "${bin_root}/bun" install --frozen-lockfile --ignore-scripts
    "${bin_root}/bun" run --cwd packages/assets build
    NEXT_PUBLIC_DISABLE_USER_SIGNUP=true \
      NEXT_PUBLIC_INSTANCE_NAME=126f \
      "${bin_root}/bun" run --cwd apps/web build
    install -d apps/backend/dist/public
    cp -a apps/web/dist/. apps/backend/dist/public/
    "${bin_root}/bun" run --cwd apps/backend build
  )

  touch "${source_dir}/.dashwise-release-complete"
  chown -R root:root "${source_dir}"
  mv -- "${source_dir}" "${release_dir}"
fi

if [[ ! -f ${config_file} ]]; then
  pb_admin_password=$(openssl rand -hex 32)
  env_stage=${staging_root}/126f.env
  umask 0077
  {
    printf '%s\n' \
      'NODE_ENV=production' \
      'ENVIRONMENT=production' \
      'HOST=::' \
      'PORT=3000' \
      'PB_URL=http://127.0.0.1:8090' \
      'PB_LISTEN_ADDRESS=127.0.0.1:8090' \
      "PB_BINARY_PATH=${bin_root}/pocketbase" \
      'PB_ADMIN_EMAIL=dashwise-superuser@126f.invalid' \
      "PB_ADMIN_PASSWORD=${pb_admin_password}" \
      'DASHWISE_LOGIN_ALIAS=thzh' \
      'DASHWISE_LOGIN_EMAIL=thzh@126f.invalid' \
      'DISABLE_USER_SIGNUP=false' \
      'INSTANCE_NAME=126f' \
      'DASHWISE_URL=http://100.80.188.111:3000' \
      'APP_BASE_URL=http://100.80.188.111:3000' \
      'VALKEY_URL=redis://127.0.0.1:6379' \
      'HOME_SERVER_ZASHBOARD_URL=http://100.80.188.111:60127' \
      'HOME_SERVER_BESZEL_URL=http://100.80.188.111:8091' \
      'HOME_SERVER_HARNESS_URL=https://zhou12600kf.tailb8f499.ts.net/' \
      'HOME_SERVER_NETALERTX_URL=https://zhou12600kf.tailb8f499.ts.net:20211/' \
      'HOME_SERVER_ROUTER_URL=https://zhou12600kf.tailb8f499.ts.net:12443/' \
      'LOG_LEVEL=info'
  } >"${env_stage}"
  install -m 0640 -o root -g dashwise "${env_stage}" "${config_file}"
fi

unit_stage=${staging_root}/dashwise-126f.service
cat >"${unit_stage}" <<EOF
[Unit]
Description=126f Dashwise liquid-glass dashboard
After=network-online.target valkey-server.service tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=dashwise
Group=dashwise
WorkingDirectory=${app_root}/current/apps/backend
EnvironmentFile=${config_file}
ExecStart=${bin_root}/bun src/index.ts
Restart=on-failure
RestartSec=5s
TimeoutStartSec=60s
TimeoutStopSec=30s
KillMode=mixed
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
ReadOnlyPaths=${config_file}
ReadWritePaths=/var/lib/dashwise
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

previous_target=
if [[ -L ${app_root}/current ]]; then
  candidate_target=$(readlink "${app_root}/current")
  if [[ ${candidate_target} != "${release_dir}" && -f ${candidate_target}/.dashwise-release-complete ]]; then
    previous_target=${candidate_target}
  fi
fi
ln -sfn "${release_dir}" "${app_root}/current"

rollback() {
  printf '%s\n' 'ERROR: new dashboard release failed health verification; rolling back' >&2
  rm -f -- "${release_marker}"
  if [[ -n ${previous_target} && -d ${previous_target} ]]; then
    ln -sfn "${previous_target}" "${app_root}/current"
    systemctl restart dashwise-126f.service || true
  else
    systemctl stop dashwise-126f.service || true
  fi
  exit 1
}

systemctl daemon-reload
systemctl enable --now valkey-server.service
systemctl enable dashwise-126f.service
systemctl restart dashwise-126f.service || rollback

healthy=false
for _ in $(seq 1 60); do
  if curl --noproxy '*' --fail --silent --show-error --max-time 2 'http://[::1]:3000/health' >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done
[[ ${healthy} == true ]] || rollback

systemctl is-active --quiet dashwise-126f.service
systemctl is-active --quiet valkey-server.service
curl --noproxy '*' --fail --silent --show-error 'http://[::1]:3000/health' | grep -q '"status":"ok"'
printf 'Dashwise release %s is healthy on TCP 3000.\n' "${remote_commit}"
