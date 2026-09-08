/**
 * Rolling log of API calls, for seeing what an AI agent actually did.
 *
 * When an agent gives a wrong answer, the question is always the same: did it
 * call the wrong endpoint, pass a bad customer_id, or read a correct response
 * incorrectly? Without a log the three are indistinguishable.
 *
 * Held in process memory alongside the rest of the state, so it is per-instance
 * and lost on restart — which is fine, it only has to outlive the request being
 * debugged.
 *
 * Off by default. Set REQUEST_LOG=1 to enable. Enabling costs nothing but the
 * memory for MAX_ENTRIES rows.
 */

export const ENABLED = process.env.REQUEST_LOG === "1" || process.env.REQUEST_LOG === "true";

/**
 * Requests carrying this header are not logged.
 *
 * The admin panel polls /api/admin/orders, /api/admin/returns and /api/products
 * on every load and every action, so without this the log fills with the panel's
 * own instrumentation — three rows per Refresh — and the agent traffic it exists
 * to show gets buried. The panel is the surface you are already looking at; its
 * own calls tell you nothing you did not just do.
 */
export const SKIP_HEADER = "x-admin-panel";

/**
 * ~96 KB at the observed average entry size, and 50-150 agent conversations at
 * 3-10 tool calls each — more than one debugging session, and small enough to
 * keep in memory and hand to the admin panel whole.
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

/** Newest first. Per-process; trimmed to MAX_ENTRIES on every append. */
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

/** Records `entry`, dropping the oldest once MAX_ENTRIES is reached. */
export function append(entry: LogEntry): void {
  if (!ENABLED) return;
  memoryLog.unshift(entry);
  if (memoryLog.length > MAX_ENTRIES) memoryLog.length = MAX_ENTRIES;
}

/** Newest first. `limit` caps how many are returned, not how many are kept. */
export function read(limit = MAX_ENTRIES): LogEntry[] {
  return memoryLog.slice(0, limit);
}

export function clear(): void {
  memoryLog.length = 0;
}
