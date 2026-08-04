import type { NextApiRequest, NextApiResponse } from "next";
import {
  CUSTOMERS,
  seedProducts,
  seedReturns,
  buildSeedOrders,
  Order,
  Product,
  ReturnRecord,
  OrderItem,
} from "./data";
import * as store from "./store";
import * as requestLog from "./requestLog";

export interface CartItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  qty: number;
  line_total: number;
  image_url: string;
  category: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FLEXIBLE IN-MEMORY STATE (module-scoped — mirrors app.py's Python globals)
// ─────────────────────────────────────────────────────────────────────────────
export let ORDERS: Record<string, Order> = {};
export let CARTS: Record<string, CartItem[]> = {};
export let DYNAMIC_RETURNS: Record<string, ReturnRecord> = {};
export let PRODUCTS: Record<string, Product> = seedProducts();
export const RETURNS: Record<string, ReturnRecord> = seedReturns();

// runtime order IDs start at ORD-20000, well clear of seeded ORD-1xxxx IDs
export const orderCounter = { value: 20000 };
// runtime return IDs start at RET-2210
export const returnCounter = { value: 2210 };

export let SEED_ORDER_IDS: Set<string> = new Set();
export const SEED_RETURN_IDS: Set<string> = new Set(Object.keys(RETURNS));

/**
 * The live record for a return id. DYNAMIC_RETURNS wins over RETURNS: a seeded
 * return that the admin panel has edited is promoted into DYNAMIC_RETURNS (see
 * `mutableReturn`), and that copy is the current one.
 */
export function findReturn(returnId: string): ReturnRecord | undefined {
  return DYNAMIC_RETURNS[returnId] || RETURNS[returnId];
}

/**
 * Return statuses that mean the return is finished and no longer blocks anything.
 * Anything else is "open" — the item is still in flight or under review.
 */
const CLOSED_RETURN_STATUSES = new Set(["completed", "rejected"]);

/** Open returns against `orderId`, newest first. Empty when nothing is in flight. */
export function openReturnsForOrder(orderId: string): ReturnRecord[] {
  return allReturns().filter(
    (ret) => ret.order_id === orderId && !CLOSED_RETURN_STATUSES.has(ret.status)
  );
}

/** Every return, newest-initiated first, with seed overrides already applied. */
export function allReturns(): ReturnRecord[] {
  const merged: Record<string, ReturnRecord> = { ...RETURNS, ...DYNAMIC_RETURNS };
  return Object.values(merged).sort((a, b) =>
    (b.return_initiated || "").localeCompare(a.return_initiated || "")
  );
}

/**
 * A writable record for `returnId`, copying a seeded return into DYNAMIC_RETURNS
 * on first write. RETURNS is rebuilt from seedReturns() at every module load and
 * never enters the persisted snapshot, so mutating it in place would be lost as
 * soon as the next request landed on a different serverless instance. Promoting
 * to DYNAMIC_RETURNS puts the edit somewhere that persists — and admin/reset
 * clears DYNAMIC_RETURNS, which restores the seeded values.
 */
export function mutableReturn(returnId: string): ReturnRecord | undefined {
  const existing = DYNAMIC_RETURNS[returnId];
  if (existing) return existing;
  const seed = RETURNS[returnId];
  if (!seed) return undefined;
  DYNAMIC_RETURNS[returnId] = { ...seed };
  return DYNAMIC_RETURNS[returnId];
}

const _ORIGINAL_STOCK: Record<string, number> = Object.fromEntries(
  Object.entries(seedProducts()).map(([pid, p]) => [pid, p.stock])
);

function seedOrders(): void {
  const now = new Date();
  const seeded = buildSeedOrders(now);
  ORDERS = { ...ORDERS, ...seeded };
  SEED_ORDER_IDS = new Set([...SEED_ORDER_IDS, ...Object.keys(seeded)]);
}

/**
 * Re-anchors the seeded orders' dates to today.
 *
 * buildSeedOrders() computes every date relative to `now`, but a persisted
 * snapshot carries whatever `now` was when it was first written — so seeded
 * dates froze on the first run and drifted staler every day the store survived.
 * The visible symptom was the 30-day return window silently expiring on orders
 * that are supposed to be returnable, which had to be undone by hand.
 *
 * Only the two date fields move. Status, damage claims, addresses and every
 * other staged edit are left exactly as they were, so a scenario set up
 * yesterday still reads the same today. Orders with `date_pinned` opt out.
 */
function refreshSeedOrderDates(): void {
  const fresh = buildSeedOrders(new Date());
  for (const [oid, seed] of Object.entries(fresh)) {
    const order = ORDERS[oid];
    if (!order || order.date_pinned) continue;
    order.placed_at = seed.placed_at;
    order.estimated_delivery = seed.estimated_delivery;
  }
}

function resetAllState(): void {
  ORDERS = {};
  CARTS = {};
  DYNAMIC_RETURNS = {};
  PRODUCTS = seedProducts();
  orderCounter.value = 20000;
  returnCounter.value = 2210;
  SEED_ORDER_IDS = new Set();
  seedOrders();
}

// Seed once at module load (mirrors `_seed_orders()` call at import time in app.py)
resetAllState();

/** Full admin/reset behavior: keep seed orders, drop runtime orders, restore stock. */
export function adminReset(): void {
  for (const oid of Object.keys(ORDERS)) {
    if (!SEED_ORDER_IDS.has(oid)) {
      delete ORDERS[oid];
    }
  }
  DYNAMIC_RETURNS = {};
  CARTS = {};
  orderCounter.value = 20000;
  returnCounter.value = 2210;
  for (const [pid, originalStock] of Object.entries(_ORIGINAL_STOCK)) {
    if (PRODUCTS[pid]) PRODUCTS[pid].stock = originalStock;
  }
  seedOrders();
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED STATE PERSISTENCE (Upstash Redis) — mirrors app.py before/after hooks
// ─────────────────────────────────────────────────────────────────────────────
interface Snapshot {
  orders: Record<string, Order>;
  carts: Record<string, CartItem[]>;
  dynamic_returns: Record<string, ReturnRecord>;
  order_counter: number;
  return_counter: number;
  product_stock: Record<string, number>;
}

function snapshotState(): Snapshot {
  return {
    orders: ORDERS,
    carts: CARTS,
    dynamic_returns: DYNAMIC_RETURNS,
    order_counter: orderCounter.value,
    return_counter: returnCounter.value,
    product_stock: Object.fromEntries(Object.entries(PRODUCTS).map(([pid, p]) => [pid, p.stock])),
  };
}

function applyState(state: Partial<Snapshot>): void {
  ORDERS = (state.orders as Record<string, Order>) || {};

  // Snapshots written before status moved onto the order carry no `status`
  // field, and their statuses live in a separate `status_overrides` map that
  // nothing reads any more. Left alone, every persisted order silently reads
  // back as "processing". Recover what was explicitly set; anything else was
  // derived from elapsed time and was never stored, so seeded orders need an
  // admin/reset to get their intended statuses back.
  const legacyOverrides = (state as { status_overrides?: Record<string, string> }).status_overrides;
  for (const [oid, order] of Object.entries(ORDERS)) {
    if (!order.status) {
      order.status = (legacyOverrides?.[oid] as Order["status"]) || "processing";
    }
  }

  // Seed dates come from whenever the snapshot was written, so re-anchor them to
  // today before anything reads them.
  refreshSeedOrderDates();

  CARTS = (state.carts as Record<string, CartItem[]>) || {};
  DYNAMIC_RETURNS = (state.dynamic_returns as Record<string, ReturnRecord>) || {};
  orderCounter.value = state.order_counter ?? orderCounter.value;
  returnCounter.value = state.return_counter ?? returnCounter.value;
  const productStock = state.product_stock || {};
  for (const [pid, stock] of Object.entries(productStock)) {
    if (PRODUCTS[pid]) PRODUCTS[pid].stock = stock;
  }
}

/** False when the store was unreachable, so the in-memory state may be stale. */
async function loadSharedState(): Promise<boolean> {
  if (!store.ENABLED) return true;
  const { ok, state } = await store.loadState();
  if (state) {
    applyState(state as Partial<Snapshot>);
  }
  return ok;
}

async function saveSharedState(extraCommands: unknown[][] = []): Promise<void> {
  if (!store.ENABLED) return;
  await store.saveState(snapshotState() as unknown as Record<string, unknown>, extraCommands);
}

/** Save and unlock in one round trip. See store.saveStateAndRelease. */
async function saveSharedStateAndRelease(extraCommands: unknown[][], lockToken: string): Promise<void> {
  if (!store.ENABLED) return;
  await store.saveStateAndRelease(
    snapshotState() as unknown as Record<string, unknown>,
    extraCommands,
    lockToken
  );
}

function setNoCacheHeaders(res: NextApiResponse): void {
  // jsonify() sends no Cache-Control header, so browsers/CDNs (Vercel's edge
  // included) are free to cache API responses using their own heuristics —
  // showing stale data on the frontend until a hard refresh bypasses the
  // cache. API/admin responses always need to be live.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Serializes mutating requests handled by THIS process, before they contend for
 * the cross-instance Redis lock.
 *
 * Two reasons it exists rather than relying on the Redis lock alone:
 *
 *  1. Correctness within one process. ORDERS/CARTS/etc. are module globals, and
 *     `loadSharedState()` replaces them wholesale at the start of every request.
 *     Two overlapping handlers in the same process therefore clobber each other
 *     in memory, before Redis is even involved.
 *  2. Cost. A mutating request holds the Redis lock for four round trips
 *     (~800ms to a hosted store), so N concurrent writers make the Nth wait
 *     ~N x 800ms — enough to blow any sane acquire timeout at N of 5 or more.
 *     Queuing here is free and instant, so by the time a request reaches Redis
 *     the lock is almost always uncontended.
 *
 * The Redis lock still matters: it's the only thing protecting against a second
 * serverless instance writing concurrently, which this queue cannot see.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  // Chain off the tail regardless of whether it settled or rejected, so one
  // failed request can't wedge the queue for everything behind it.
  const result = writeQueue.then(task, task);
  writeQueue = result.catch(() => undefined);
  return result;
}

export type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => void | Promise<void>;

/**
 * Wraps an API route handler to:
 *  (a) queue behind any other mutating request in this process, then take the
 *      cross-instance write lock, if this request will mutate state,
 *  (b) load shared state from Redis before running business logic (no-op if
 *      store isn't configured — falls back to in-memory seed data),
 *  (c) run the handler,
 *  (d) save state after IF the request method was POST/PUT/PATCH/DELETE,
 *  (e) release the lock.
 *
 * Saving is intentionally skipped on GET: a read-only request that loaded a
 * slightly-older snapshot could otherwise resave it after a concurrent write
 * finished, silently clobbering that write (classic last-write-wins lost
 * update) — this mirrors a real bug already fixed in the Flask version.
 *
 * That alone only protects against reads clobbering writes. Two concurrent
 * *writes* still raced: both loaded the same blob, each applied its own change,
 * and the second save overwrote the first. Step (a) closes that by serializing
 * mutating requests, so each one loads the previous one's result. The lock spans
 * load-through-save — taking it after the load would leave the read-modify-write
 * just as interleaved as before.
 *
 * Step (d) must finish BEFORE the response reaches the client. Handlers call
 * res.json() themselves, which would flush the 200 while the Redis write was
 * still in flight — so a read fired right after (an admin refresh following a
 * cancellation, a cart GET after an add) could load a pre-write snapshot, and
 * because GETs never save, nothing would repair the stale view until the next
 * read. res.json() is therefore buffered here and replayed after the save.
 */
export function withState(handler: ApiHandler): ApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // MUTATING_METHODS drives the queue even when the store is disabled: the
    // in-memory clobbering in (1) above happens with or without Redis.
    const mutating = MUTATING_METHODS.has(req.method || "");

    const run = async () => {
      const startedAt = Date.now();
      const requestBody = mutating ? req.body : undefined;
      const lockToken = mutating ? await store.acquireLock() : null;
      // Set once the save has already released the lock, so `finally` does not
      // release it a second time — and still does release it if the handler threw
      // before the save ran.
      let lockReleased = false;

      const sendJson = res.json.bind(res);
      let payload: unknown;
      let responded = false;
      res.json = ((body: unknown) => {
        payload = body;
        responded = true;
        return res;
      }) as NextApiResponse["json"];

      try {
        const loaded = await loadSharedState();
        setNoCacheHeaders(res);

        // Refuse to write on top of a failed load. The in-memory state is
        // whatever the last successful request left behind, so mutating and
        // saving it would overwrite the real blob with something arbitrarily
        // stale — silent data loss, reported to the caller as success. Reads are
        // fine: they show slightly old data and save nothing.
        if (mutating && !loaded) {
          res.status(503).json({
            ok: false,
            error: "state_unavailable",
            message: "Could not read current state, so the change was not applied. Please retry.",
          });
          return;
        }

        await handler(req, res);

        // Built before the save so `ms` covers the handler, and so the append can
        // be pipelined into that save rather than costing its own round trip.
        const skipLog = Boolean(req.headers[requestLog.SKIP_HEADER]);
        const entry = requestLog.ENABLED && !skipLog
          ? requestLog.buildEntry({
              method: req.method || "?",
              path: req.url || "?",
              status: res.statusCode,
              payload,
              body: requestBody,
              startedAt,
              isMutation: mutating,
            })
          : null;

        if (mutating) {
          const logCommands = entry ? requestLog.appendCommands(entry) : [];
          if (lockToken) {
            // Save, log and unlock in a single round trip.
            await saveSharedStateAndRelease(logCommands, lockToken);
            lockReleased = true;
          } else {
            await saveSharedState(logCommands);
          }
          if (entry) requestLog.appendToMemory(entry);
        } else if (entry) {
          // A read has no save to ride along with, so this is the one extra round
          // trip that enabling the log costs.
          await requestLog.append(entry);
        }
      } finally {
        // Release before replaying the response: the client should never be able
        // to fire its next request while this one still holds the lock. Skipped
        // when the pipelined save already released it.
        if (lockToken && !lockReleased) await store.releaseLock(lockToken);
        res.json = sendJson;
        if (responded) sendJson(payload);
      }
    };

    return mutating ? enqueueWrite(run) : run();
  };
}

export type { Order, Product, ReturnRecord, OrderItem };
export { CUSTOMERS };
