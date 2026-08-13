#!/usr/bin/env bash
set -Eeuo pipefail

config_file=/etc/dashwise/126f.env
service_name=dashwise-126f.service
api_root=http://127.0.0.1:3000/api/v1/auth
admin_alias=thzh
admin_email=thzh@126f.invalid

if [[ ${EUID} -ne 0 ]]; then
  printf '%s\n' 'ERROR: run this initializer through sudo' >&2
  exit 1
fi

[[ -f ${config_file} ]] || { printf 'ERROR: missing %s\n' "${config_file}" >&2; exit 1; }
systemctl is-active --quiet "${service_name}" \
  || { printf 'ERROR: %s is not active\n' "${service_name}" >&2; exit 1; }

umask 0077
response_file=$(mktemp /tmp/dashwise-admin-response.XXXXXX)
case ${response_file} in
  /tmp/dashwise-admin-response.*) ;;
  *) printf 'ERROR: unsafe response path: %s\n' "${response_file}" >&2; exit 1 ;;
esac

dashboard_password=
cleanup() {
  dashboard_password=
  if [[ -f ${response_file} ]]; then
    rm -f -- "${response_file}"
  fi
}
trap cleanup EXIT

read -r -s -p 'Dashboard password: ' dashboard_password </dev/tty
printf '\n' >/dev/tty
if (( ${#dashboard_password} < 8 )); then
  printf '%s\n' 'ERROR: dashboard password must be at least 8 characters' >&2
  exit 1
fi

make_payload() {
  local action=$1
  printf '%s' "${dashboard_password}" | python3 -c '
import json
import sys

password = sys.stdin.read()
payload = {"email": "thzh@126f.invalid", "password": password}
if sys.argv[1] == "signup":
    payload.update({"_name": "thzh", "passwordConfirm": password})
json.dump(payload, sys.stdout, separators=(",", ":"))
' "${action}"
}

signup_http=$(
  make_payload signup | curl --noproxy '*' --silent --show-error --max-time 20 \
    --output "${response_file}" --write-out '%{http_code}' \
    --header 'Content-Type: application/json' --data-binary @- \
    "${api_root}/signup"
)
case ${signup_http} in
  200|201|400) ;;
  *) printf 'ERROR: administrator signup returned HTTP %s\n' "${signup_http}" >&2; exit 1 ;;
esac

login_http=$(
  make_payload login | curl --noproxy '*' --silent --show-error --max-time 20 \
    --output "${response_file}" --write-out '%{http_code}' \
    --header 'Content-Type: application/json' --data-binary @- \
    "${api_root}/login"
)
[[ ${login_http} == 200 ]] \
  || { printf 'ERROR: administrator login verification returned HTTP %s\n' "${login_http}" >&2; exit 1; }

python3 - "${response_file}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as response:
    payload = json.load(response)
if not isinstance(payload.get("token"), str) or not payload["token"]:
    raise SystemExit("ERROR: login response did not contain an authentication token")
PY

if grep -q '^DISABLE_USER_SIGNUP=' "${config_file}"; then
  sed -i 's/^DISABLE_USER_SIGNUP=.*/DISABLE_USER_SIGNUP=true/' "${config_file}"
else
  printf '%s\n' 'DISABLE_USER_SIGNUP=true' >>"${config_file}"
fi
chown root:dashwise "${config_file}"
chmod 0640 "${config_file}"
systemctl restart "${service_name}"

healthy=false
for _ in $(seq 1 30); do
  if curl --noproxy '*' --fail --silent --show-error --max-time 2 \
    'http://127.0.0.1:3000/health' >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done
[[ ${healthy} == true ]] || { printf '%s\n' 'ERROR: dashboard failed after locking signup' >&2; exit 1; }

disabled_http=$(
  printf '%s' '{"email":"blocked@126f.invalid"}' \
    | curl --noproxy '*' --silent --show-error --max-time 20 \
      --output "${response_file}" --write-out '%{http_code}' \
      --header 'Content-Type: application/json' --data-binary @- \
      "${api_root}/signup"
)
[[ ${disabled_http} == 401 ]] \
  || { printf 'ERROR: signup lock verification returned HTTP %s\n' "${disabled_http}" >&2; exit 1; }

dashboard_password=
printf 'Dashboard administrator %s is initialized and signup is locked.\n' "${admin_alias}"
