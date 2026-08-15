#!/usr/bin/env python3
"""Validate a Cloudflare remotely-managed tunnel token without printing it."""

from __future__ import annotations

import base64
import json
import re
import stat
import sys
from pathlib import Path


def reject(message: str) -> "NoReturn":
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if len(sys.argv) != 2:
    reject("expected one token-file path")

token_path = Path(sys.argv[1])
try:
    token_stat = token_path.lstat()
except OSError:
    reject("token file is missing or unreadable")

if not stat.S_ISREG(token_stat.st_mode) or token_path.is_symlink():
    reject("token path must be a regular file, not a link")

try:
    raw = token_path.read_bytes()
except OSError:
    reject("token file is unreadable")

if not raw or len(raw) > 8192:
    reject("token file has an invalid size")

token_bytes = raw[:-1] if raw.endswith(b"\n") else raw
if not token_bytes or b"\n" in token_bytes or b"\r" in token_bytes:
    reject("token file must contain exactly one line")

try:
    token = token_bytes.decode("ascii")
except UnicodeDecodeError:
    reject("token file must contain ASCII data")

if re.fullmatch(r"eyJ[A-Za-z0-9_-]{40,4096}", token) is None:
    reject("token has an invalid Cloudflare tunnel-token shape")

try:
    padded = token + "=" * (-len(token) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
    reject("token payload is not valid base64url JSON")

if not isinstance(payload, dict) or any(
    not isinstance(payload.get(key), str) or not payload[key] for key in ("a", "t", "s")
):
    reject("token payload is missing required fields")
