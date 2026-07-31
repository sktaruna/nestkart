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

/**
 * Runs several commands in ONE HTTP request via Upstash's /pipeline endpoint.
 *
 * Commands execute in order on a single connection, which is what makes it safe
 * to bundle "save the state, then release the lock" — the ordering guarantee is
 * the point, not just the saved latency. Not a transaction: a failure part-way
 * does not roll back the earlier commands.
 */
export async function pipeline(commands: unknown[][]): Promise<unknown[]> {
  if (!ENABLED || commands.length === 0) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${(_REDIS_URL as string).replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${_REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Upstash HTTP ${res.status}: ${text}`);
    }
    const data = JSON.parse(text) as Array<{ result?: unknown; error?: string }>;
    return data.map((entry) => entry.result);
  } finally {
    clearTimeout(timeout);
  }
}

/** Runs a single command. Exposed for callers that own their own Redis keys. */
export async function command(...args: unknown[]): Promise<unknown> {
  if (!ENABLED) return null;
  return _cmd(...args);
}

/**
 * Outcome of a load attempt.
 *
 * `ok: false` (the store was unreachable) has to be distinguishable from
 * `state: null` (the store answered, nothing saved yet). Collapsing the two into
 * a bare null meant a failed read looked exactly like a fresh database: the
 * caller kept its stale in-memory state and, on a write, saved it straight over
 * whatever was really in Redis.
 */
export interface LoadResult {
  ok: boolean;
  state: Record<string, unknown> | null;
}

export async function loadState(): Promise<LoadResult> {
  if (!ENABLED) return { ok: true, state: null };
  try {
    const raw = (await _cmd("GET", STATE_KEY)) as string | null;
    return { ok: true, state: raw ? JSON.parse(raw) : null };
  } catch (e) {
    // Logged so it's visible in Vercel's function logs rather than failing
    // silently. Reads carry on with local memory; writes must not — see
    // withState.
    console.error(`[store] load_state failed: ${String(e)}`);
    return { ok: false, state: null };
  }
}

/**
 * Persists the state blob.
 *
 * `extraCommands` are pipelined into the same round trip, running after the SET.
 * The request log uses this so that enabling it costs a mutating request nothing
 * — the append rides along with a write that was already happening.
 */
export async function saveState(
  state: Record<string, unknown>,
  extraCommands: unknown[][] = []
): Promise<void> {
  if (!ENABLED) return;
  try {
    const setState: unknown[] = ["SET", STATE_KEY, JSON.stringify(state)];
    if (extraCommands.length === 0) {
      await _cmd(...setState);
    } else {
      await pipeline([setState, ...extraCommands]);
    }
  } catch (e) {
    console.error(`[store] save_state failed: ${String(e)}`);
  }
}

/**
 * Saves state and releases the lock in ONE round trip.
 *
 * A mutating request used to make four separate calls — acquire, load, save,
 * release. Each is a chance to be caught by the 5s abort, and the abort is a
 * wall-clock timer, so under CPU pressure it can cancel a call that would have
 * returned in 130ms. Folding save and release together takes writes to three.
 *
 * Ordering is what makes this safe: pipelined commands run in sequence on one
 * connection, so the release cannot land before the save.
 */
export async function saveStateAndRelease(
  state: Record<string, unknown>,
  extraCommands: unknown[][],
  lockToken: string
): Promise<void> {
  if (!ENABLED) return;
  try {
    await pipeline([
      ["SET", STATE_KEY, JSON.stringify(state)],
      ...extraCommands,
      [
        "EVAL",
        'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
        1,
        LOCK_KEY,
        lockToken,
      ],
    ]);
  } catch (e) {
    console.error(`[store] save_and_release failed: ${String(e)}`);
    // The lock is left to expire by TTL rather than risking a second failed call.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE LOCK
// ─────────────────────────────────────────────────────────────────────────────
/**
 * State lives in a single JSON blob, so every mutation is a read-modify-write of
 * the whole thing. Two concurrent writers both GET the same blob, each applies
 * its own change, and the second SET overwrites the first — the classic lost
 * update. It shows up as an action that reported success and then wasn't there:
 * "I cancelled that order but it's still processing."
 *
 * A short-lived Redis lock serializes the mutating requests so each one reads
 * the previous one's result. Reads are unlocked — they never save, so they can't
 * clobber anything.
 */
export const LOCK_KEY = "nestkart_state_lock";

/**
 * Held across one handler — four round trips to a hosted store, ~800ms in
 * practice. Comfortably above that so a slow save can't have the lock expire
 * underneath it, but low enough that a request which dies holding it stops
 * blocking writers quickly.
 */
const LOCK_TTL_MS = 10000;
/**
 * How long a writer waits for the current holder before giving up.
 *
 * Sized for CROSS-INSTANCE contention only: requests within one process already
 * queue in `withState` before reaching here, so the realistic worst case is a
 * handful of other serverless instances writing at once, not the full burst.
 */
const LOCK_ACQUIRE_TIMEOUT_MS = 5000;
const LOCK_POLL_MS = 50;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns an opaque token to pass to `releaseLock`, or null if the lock could
 * not be taken in time.
 *
 * A null return does NOT block the request. Refusing to write would turn a rare
 * race into a visible failure for the agent under test, which is the worse
 * trade for a demo harness — so the caller proceeds unlocked and accepts the
 * original risk. The TTL guarantees this self-heals: a request that dies holding
 * the lock releases it within LOCK_TTL_MS rather than wedging every later write.
 */
export async function acquireLock(): Promise<string | null> {
  if (!ENABLED) return null;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const res = await _cmd("SET", LOCK_KEY, token, "NX", "PX", LOCK_TTL_MS);
      if (res === "OK") return token;
    } catch (e) {
      // Store unreachable: loadState/saveState already degrade to in-memory, so
      // there's nothing to serialize against. Don't spin.
      console.error(`[store] acquire_lock failed: ${String(e)}`);
      return null;
    }
    await sleep(LOCK_POLL_MS);
  }

  console.error(`[store] acquire_lock timed out after ${LOCK_ACQUIRE_TIMEOUT_MS}ms; proceeding unlocked`);
  return null;
}

/**
 * Releases the lock only if `token` still owns it. A plain DEL would let a
 * request that overran the TTL delete the lock a *different* request had since
 * acquired, letting two writers run at once — exactly what the lock prevents.
 */
export async function releaseLock(token: string): Promise<void> {
  if (!ENABLED) return;
  try {
    await _cmd(
      "EVAL",
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
      1,
      LOCK_KEY,
      token
    );
  } catch (e) {
    console.error(`[store] release_lock failed: ${String(e)}`);
  }
}
