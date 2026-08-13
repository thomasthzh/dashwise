#!/usr/bin/env bash
set -Eeuo pipefail

token_file=/etc/beszel-126f/agent-token
key_file=/etc/beszel-126f/agent-key
hub_private_key=/var/lib/beszel-126f/beszel_data/id_ed25519
hub_url=http://127.0.0.1:8091
admin_email=thzh@126f.invalid

if [[ ${EUID} -ne 0 ]]; then
  printf '%s\n' 'ERROR: run this initializer through sudo' >&2
  exit 1
fi
[[ -s ${token_file} ]] || { printf 'ERROR: missing %s\n' "${token_file}" >&2; exit 1; }
[[ -s ${hub_private_key} ]] || { printf 'ERROR: missing %s\n' "${hub_private_key}" >&2; exit 1; }
systemctl is-active --quiet beszel-126f.service \
  || { printf '%s\n' 'ERROR: Beszel hub is not active' >&2; exit 1; }

beszel_password=
key_stage=
cleanup() {
  beszel_password=
  if [[ -n ${key_stage} && -f ${key_stage} ]]; then
    case ${key_stage} in
      /etc/beszel-126f/agent-key.*) rm -f -- "${key_stage}" ;;
    esac
  fi
}
trap cleanup EXIT

key_stage=$(mktemp /etc/beszel-126f/agent-key.XXXXXX)
ssh-keygen -y -f "${hub_private_key}" >"${key_stage}"
grep -Eq '^ssh-ed25519 ' "${key_stage}" \
  || { printf '%s\n' 'ERROR: Beszel hub public key is invalid' >&2; exit 1; }
install -m 0640 -o root -g beszel "${key_stage}" "${key_file}"
rm -f -- "${key_stage}"
key_stage=

read -r -s -p 'Beszel password: ' beszel_password </dev/tty
printf '\n' >/dev/tty
if (( ${#beszel_password} < 8 )); then
  printf '%s\n' 'ERROR: Beszel password must be at least 8 characters' >&2
  exit 1
fi

printf '%s' "${beszel_password}" | python3 -c '
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

root = "http://127.0.0.1:8091"
email = "thzh@126f.invalid"
password = sys.stdin.read()

def send(path, payload=None, headers=None):
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    request = urllib.request.Request(
        root + path,
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read()
            return response.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        body = error.read()
        try:
            parsed = json.loads(body) if body else {}
        except json.JSONDecodeError:
            parsed = {}
        return error.code, parsed

create_status, _ = send("/api/beszel/create-user", {"email": email, "password": password})
if create_status not in (200, 201, 403, 404):
    raise SystemExit(f"ERROR: Beszel user initialization returned HTTP {create_status}")

auth_status, auth = send(
    "/api/collections/users/auth-with-password",
    {"identity": email, "password": password},
)
auth_token = auth.get("token")
if auth_status != 200 or not isinstance(auth_token, str) or not auth_token:
    raise SystemExit(f"ERROR: Beszel login verification returned HTTP {auth_status}")

agent_token = pathlib.Path("/etc/beszel-126f/agent-token").read_text(encoding="utf-8").strip()
if len(agent_token) < 32:
    raise SystemExit("ERROR: Beszel agent token is invalid")
query = urllib.parse.urlencode({"enable": "1", "permanent": "1", "token": agent_token})
token_status, result = send(
    "/api/beszel/universal-token?" + query,
    headers={"Authorization": auth_token},
)
if token_status != 200 or result.get("active") is not True or result.get("permanent") is not True:
    raise SystemExit(f"ERROR: Beszel universal token activation returned HTTP {token_status}")
'

beszel_password=
systemctl restart beszel-agent-126f.service
sleep 2
systemctl is-active --quiet beszel-agent-126f.service
printf 'Beszel administrator %s is initialized and the local agent credentials are active.\n' "${admin_email%%@*}"
