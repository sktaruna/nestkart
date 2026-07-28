/**
 * Shared state persistence for NestKart mock API.
 *
 * Vercel runs this app as serverless functions: different requests can land on
 * different, isolated instances that don't share process memory. Plain
 * in-memory globals look like they work on one request and then "reset" on
 * the next. To make ORDERS/CARTS/etc. consistent across instances, this
 * module persists a single JSON blob to a hosted Redis store (Upstash) via
 * its REST API and re-loads it on every request.
 *
 * Configure via env vars. Both naming conventions are accepted, because
 * Vercel's KV/Upstash marketplace integration auto-injects KV_REST_API_*
 * names while a manually-created Upstash database documents itself as
 * UPSTASH_REDIS_REST_*. Reading only one set meant the vars could look
 * "present" in the Vercel dashboard while the app still saw nothing and
 * silently ran in per-instance in-memory mode:
 *     UPSTASH_REDIS_REST_URL   or  KV_REST_API_URL
 *     UPSTASH_REDIS_REST_TOKEN or  KV_REST_API_TOKEN
 *
 * If neither is set (e.g. running locally), this module is a no-op and the
 * app falls back to plain in-memory state, resetting on restart — which is
 * fine for local dev.
 *
 * Note: the read-only token (KV_REST_API_READ_ONLY_TOKEN) will NOT work —
 * saving state requires write access. KV_URL/REDIS_URL are the raw Redis
 * TCP protocol, not the REST API this module speaks.
 */

export const STATE_KEY = "nestkart_state";

const _REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const _REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const ENABLED = Boolean(_REDIS_URL && _REDIS_TOKEN);

async function _cmd(...args: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(_REDIS_URL as string, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${_REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Upstash HTTP ${res.status}: ${text}`);
    }
    const data = JSON.parse(text);
    return data.result;
  } finally {
    clearTimeout(timeout);
  }
}

/** Returns the persisted state object, or null if unavailable/not yet saved. */
export async function loadState(): Promise<Record<string, unknown> | null> {
  if (!ENABLED) return null;
  try {
    const raw = (await _cmd("GET", STATE_KEY)) as string | null;
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    // Store unreachable — fall back to whatever's already in local memory
    // rather than breaking the request. Logged so it's visible in Vercel's
    // function logs instead of failing completely silently.
    console.error(`[store] load_state failed: ${String(e)}`);
    return null;
  }
}

export async function saveState(state: Record<string, unknown>): Promise<void> {
  if (!ENABLED) return;
  try {
    await _cmd("SET", STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error(`[store] save_state failed: ${String(e)}`);
  }
}
