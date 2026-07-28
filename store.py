"""
Shared state persistence for NestKart mock API.

Vercel runs this app as serverless functions: different requests can land on
different, isolated instances that don't share Python process memory. Plain
in-memory globals (or writing to a local file) look like they work on one
request and then "reset" on the next. To make ORDERS/CARTS/etc. consistent
across instances, this module persists a single JSON blob to a hosted Redis
store (Upstash) via its REST API and re-loads it on every request.

Configure via env vars (set these in the Vercel project settings):
    UPSTASH_REDIS_REST_URL
    UPSTASH_REDIS_REST_TOKEN

If those aren't set (e.g. running locally with `python app.py`), this module
is a no-op and the app falls back to plain in-memory state, resetting on
restart — which is fine for local dev.
"""

import os
import json
import urllib.request
import urllib.error

STATE_KEY = "nestkart_state"

_REDIS_URL = os.environ.get("UPSTASH_REDIS_REST_URL")
_REDIS_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN")

ENABLED = bool(_REDIS_URL and _REDIS_TOKEN)


def _cmd(*args, timeout=5):
    req = urllib.request.Request(
        _REDIS_URL,
        data=json.dumps(list(args)).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {_REDIS_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8")).get("result")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Upstash HTTP {e.code}: {body}") from None


def load_state():
    """Returns the persisted state dict, or None if unavailable/not yet saved."""
    if not ENABLED:
        return None
    try:
        raw = _cmd("GET", STATE_KEY)
        return json.loads(raw) if raw else None
    except Exception as e:
        # Store unreachable — fall back to whatever's already in local memory
        # rather than breaking the request. Logged so it's visible in
        # Vercel's function logs instead of failing completely silently.
        print(f"[store] load_state failed: {e!r}")
        return None


def save_state(state):
    if not ENABLED:
        return
    try:
        _cmd("SET", STATE_KEY, json.dumps(state))
    except Exception as e:
        print(f"[store] save_state failed: {e!r}")
