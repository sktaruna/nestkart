/**
 * Rolling log of API calls, for seeing what an AI agent actually did.
 *
 * When an agent gives a wrong answer, the question is always the same: did it
 * call the wrong endpoint, pass a bad customer_id, or read a correct response
 * incorrectly? Without a log the three are indistinguishable.
 *
 * Deliberately NOT part of the state snapshot. That blob is ~8 KB and is loaded
 * on every request and rewritten on every write; 500 log entries (~200 B each,
 * so ~96 KB) would make it roughly 12x bigger and put that cost on the hot path.
 * A separate Redis list keeps the log out of the way — it's read only when the
 * admin panel asks for it.
 *
 * Off by default. Set REQUEST_LOG=1 to enable. Enabling costs one extra Redis
 * round trip on reads (writes pipeline the append into the state save, so they
 * pay nothing), and roughly triples Redis command count — worth paying while
 * debugging an agent, not worth paying always.
 */

import * as store from "./store";

export const ENABLED = process.env.REQUEST_LOG === "1" || process.env.REQUEST_LOG === "true";

export const LOG_KEY = "nestkart_request_log";

/**
 * ~96 KB at the observed average entry size, and 50-150 agent conversations at
 * 3-10 tool calls each — more than one debugging session, still a single fast
 * LRANGE for the admin panel.
 */
export const MAX_ENTRIES = 500;

/** Bodies are small here, but a pathological one shouldn't bloat every entry. */
const MAX_BODY_CHARS = 500;

export interface LogEntry {
  /** ISO timestamp of when the request finished. */
  ts: string;
  method: string;
  /** Path including query string — the query is often the interesting part. */
  path: string;
  status: number;
  /**
   * The `ok` field from the response body, not the HTTP status. Null if the
   * response wasn't JSON. This is the column that exposes an agent treating a
   * 200-with-ok-false as success.
   */
  ok: boolean | null;
  /** The response's `error` code, when it had one. */
  error?: string;
  /** Refusal explanation. Only set when `ok` is false. */
  reason?: string;
  /** Request body for mutations. Omitted when empty; truncated if unreasonably large. */
  body?: unknown;
  /**
   * Handler duration in ms: covers loading state and running the handler, but
   * not the state save or this entry's own append — those happen afterwards.
   */
  ms: number;
}

/**
 * Fallback when Redis isn't configured (local dev). Per-process and lost on
 * restart, which is fine — it only has to outlive the request being debugged.
 */
const memoryLog: LogEntry[] = [];

function truncateBody(body: unknown): unknown {
  if (body === undefined || body === null) return undefined;
  // Next parses a bodyless POST as "" — endpoints like /admin/reset take no body,
  // and recording an empty one just adds a noise column to every such row.
  if (body === "") return undefined;
  if (typeof body === "object" && Object.keys(body as object).length === 0) return undefined;
  try {
    const serialized = JSON.stringify(body);
    if (serialized === undefined) return undefined;
    if (serialized.length <= MAX_BODY_CHARS) return body;
    return `${serialized.slice(0, MAX_BODY_CHARS)}… (truncated)`;
  } catch {
    return "(unserializable)";
  }
}

/**
 * Builds an entry from a finished request. `payload` is the response body the
 * handler produced, which is where `ok` actually lives.
 */
export function buildEntry(args: {
  method: string;
  path: string;
  status: number;
  payload: unknown;
  body: unknown;
  startedAt: number;
  isMutation: boolean;
}): LogEntry {
  const p = (args.payload && typeof args.payload === "object" ? args.payload : {}) as Record<string, unknown>;

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    method: args.method,
    path: args.path,
    status: args.status,
    ok: typeof p.ok === "boolean" ? p.ok : null,
    ms: Date.now() - args.startedAt,
  };

  if (typeof p.error === "string") entry.error = p.error;
  // Only on a refusal. `reason` is also used for the *positive* explanation on
  // return-eligibility, and recording that would put a reassuring sentence in the
  // column that otherwise means "here is why this call was rejected".
  if (entry.ok === false && typeof p.reason === "string") entry.reason = p.reason;
  // Only for mutations: a GET has no body worth recording.
  if (args.isMutation) {
    const body = truncateBody(args.body);
    if (body !== undefined) entry.body = body;
  }

  return entry;
}

/**
 * The Redis commands that append `entry` and trim the list back to MAX_ENTRIES.
 *
 * Returned rather than executed so a mutating request can pipeline them into the
 * same round trip as its state save. LPUSH puts newest first, so reading the log
 * needs no sort and LTRIM drops the oldest.
 */
export function appendCommands(entry: LogEntry): unknown[][] {
  return [
    ["LPUSH", LOG_KEY, JSON.stringify(entry)],
    ["LTRIM", LOG_KEY, 0, MAX_ENTRIES - 1],
  ];
}

/** Records `entry` under its own round trip. Used by reads, which have no save to ride along with. */
export async function append(entry: LogEntry): Promise<void> {
  if (!ENABLED) return;

  if (!store.ENABLED) {
    memoryLog.unshift(entry);
    if (memoryLog.length > MAX_ENTRIES) memoryLog.length = MAX_ENTRIES;
    return;
  }

  // Never let a logging failure affect the request being logged.
  try {
    await store.pipeline(appendCommands(entry));
  } catch (e) {
    console.error(`[requestLog] append failed: ${String(e)}`);
  }
}

/** Mirrors `append` into the in-memory fallback; no-op once Redis is configured. */
export function appendToMemory(entry: LogEntry): void {
  if (!ENABLED || store.ENABLED) return;
  memoryLog.unshift(entry);
  if (memoryLog.length > MAX_ENTRIES) memoryLog.length = MAX_ENTRIES;
}

/** Newest first. `limit` caps how many are returned, not how many are kept. */
export async function read(limit = MAX_ENTRIES): Promise<LogEntry[]> {
  if (!store.ENABLED) return memoryLog.slice(0, limit);

  try {
    const raw = (await store.command("LRANGE", LOG_KEY, 0, limit - 1)) as string[] | null;
    if (!raw) return [];
    return raw
      .map((item) => {
        try {
          return JSON.parse(item) as LogEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is LogEntry => e !== null);
  } catch (e) {
    console.error(`[requestLog] read failed: ${String(e)}`);
    return [];
  }
}

export async function clear(): Promise<void> {
  memoryLog.length = 0;
  if (!store.ENABLED) return;
  try {
    await store.command("DEL", LOG_KEY);
  } catch (e) {
    console.error(`[requestLog] clear failed: ${String(e)}`);
  }
}
