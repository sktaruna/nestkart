import type { NextApiRequest, NextApiResponse } from "next";
import {
  seedCustomers,
  seedProducts,
  seedReturns,
  seedReplacements,
  buildSeedOrders,
  Order,
  Product,
  ReturnRecord,
  ReplacementRecord,
  OrderItem,
  Customer,
} from "./data";
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
export let DYNAMIC_REPLACEMENTS: Record<string, ReplacementRecord> = {};
export let PRODUCTS: Record<string, Product> = seedProducts();
export let CUSTOMERS: Record<string, Customer> = seedCustomers();
export const RETURNS: Record<string, ReturnRecord> = seedReturns(new Date());
export const REPLACEMENTS: Record<string, ReplacementRecord> = seedReplacements(new Date());

// runtime order IDs start at ORD-20000, well clear of seeded ORD-1xxxx IDs
export const orderCounter = { value: 20000 };
// runtime return IDs start at RET-2210
export const returnCounter = { value: 2210 };
// runtime replacement IDs start at REP-3010, clear of the seeded REP-30xx IDs
export const replacementCounter = { value: 3010 };

export let SEED_ORDER_IDS: Set<string> = new Set();
export const SEED_RETURN_IDS: Set<string> = new Set(Object.keys(RETURNS));
export const SEED_REPLACEMENT_IDS: Set<string> = new Set(Object.keys(REPLACEMENTS));

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

/**
 * Completed returns against `orderId`, newest first.
 *
 * Both closed statuses stop blocking as "in flight", but they close for
 * opposite reasons and only one of them should stay re-fileable. `rejected`
 * means we refused the return and the item went back to the customer, so they
 * still hold it and may legitimately file again. `completed` means the item
 * came back and the refund was issued — the customer has neither the item nor
 * a claim, so a second return would refund the order total twice, which is the
 * same double-payout openReturnsForOrder exists to prevent.
 *
 * Kept separate from openReturnsForOrder so cancel/reschedule/replacement keep
 * their "in flight" meaning; this blocks new returns only.
 */
export function completedReturnsForOrder(orderId: string): ReturnRecord[] {
  return allReturns().filter(
    (ret) => ret.order_id === orderId && ret.status === "completed"
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

/** The live record for a replacement id. Mirrors findReturn(). */
export function findReplacement(replacementId: string): ReplacementRecord | undefined {
  return DYNAMIC_REPLACEMENTS[replacementId] || REPLACEMENTS[replacementId];
}

/** A writable record for `replacementId`. Mirrors mutableReturn(). */
export function mutableReplacement(replacementId: string): ReplacementRecord | undefined {
  const existing = DYNAMIC_REPLACEMENTS[replacementId];
  if (existing) return existing;
  const seed = REPLACEMENTS[replacementId];
  if (!seed) return undefined;
  DYNAMIC_REPLACEMENTS[replacementId] = { ...seed };
  return DYNAMIC_REPLACEMENTS[replacementId];
}

/** Every replacement, newest-requested first, with seed overrides already applied. */
export function allReplacements(): ReplacementRecord[] {
  const merged: Record<string, ReplacementRecord> = { ...REPLACEMENTS, ...DYNAMIC_REPLACEMENTS };
  return Object.values(merged).sort((a, b) =>
    (b.requested_at || "").localeCompare(a.requested_at || "")
  );
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

/**
 * The same re-anchoring for the seeded returns, and for the same reason.
 *
 * RETURNS is built once when this module loads, but the orders above are moved
 * forward on every load — so in a process that stays up, the orders advance
 * daily while their returns stay pinned to boot day, and a return ends up dated
 * before the delivery that prompted it. That is the drift the fixed 2025 dates
 * used to cause, just slower.
 *
 * Only dates move, and only on returns the admin panel has not edited: an edited
 * seed lives in DYNAMIC_RETURNS, which wins over RETURNS everywhere and is left
 * alone here.
 */
function refreshSeedReturnDates(): void {
  const fresh = seedReturns(new Date());
  for (const [rid, seed] of Object.entries(fresh)) {
    const ret = RETURNS[rid];
    if (!ret) continue;
    ret.return_initiated = seed.return_initiated;
    ret.return_received_date = seed.return_received_date;
    ret.refund_estimated_date = seed.refund_estimated_date;
    ret.refund_issued_date = seed.refund_issued_date;
  }
}

/** Same re-anchoring as refreshSeedReturnDates(), for the seeded replacements. */
function refreshSeedReplacementDates(): void {
  const fresh = seedReplacements(new Date());
  for (const [rid, seed] of Object.entries(fresh)) {
    const rep = REPLACEMENTS[rid];
    if (!rep) continue;
    rep.requested_at = seed.requested_at;
    rep.estimated_dispatch_date = seed.estimated_dispatch_date;
    rep.dispatched_date = seed.dispatched_date;
    rep.delivered_date = seed.delivered_date;
  }
}

function resetAllState(): void {
  ORDERS = {};
  CARTS = {};
  DYNAMIC_RETURNS = {};
  DYNAMIC_REPLACEMENTS = {};
  PRODUCTS = seedProducts();
  CUSTOMERS = seedCustomers();
  orderCounter.value = 20000;
  returnCounter.value = 2210;
  replacementCounter.value = 3010;
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
  DYNAMIC_REPLACEMENTS = {};
  CARTS = {};
  orderCounter.value = 20000;
  returnCounter.value = 2210;
  replacementCounter.value = 3010;
  for (const [pid, originalStock] of Object.entries(_ORIGINAL_STOCK)) {
    if (PRODUCTS[pid]) PRODUCTS[pid].stock = originalStock;
  }
  // Reverts any profile edit made through the update endpoint, same as every
  // other piece of staged state this resets.
  CUSTOMERS = seedCustomers();
  seedOrders();
  // seedOrders() re-dates the orders to today, so the returns/replacements have
  // to move with them — otherwise a reset on a long-running process leaves
  // RET-2202/REP-3001 dated before the delivery that prompted them.
  refreshSeedReturnDates();
  refreshSeedReplacementDates();
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
 * Serializes mutating requests handled by THIS process.
 *
 * ORDERS/CARTS/etc. are module globals and every mutation is a
 * read-modify-write of them. A handler that awaits part-way through can be
 * interleaved with another one, so two overlapping writes clobber each other in
 * memory. Queuing here is free and instant, and makes each mutating request see
 * the previous one's result.
 *
 * Scope: this process only. State is per-instance in-memory, so nothing
 * coordinates writes across two concurrently-running instances — see withState.
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
 *  (a) queue behind any other mutating request in this process, if this request
 *      will mutate state,
 *  (b) set no-cache headers,
 *  (c) run the handler,
 *  (d) record the request in the log when logging is enabled.
 *
 * State is plain in-memory: seeded by `lib/data.ts`, mutated in place, and lost
 * on process restart. That is sufficient for a single long-lived server, which
 * is what this expects — on a multi-instance or serverless host each instance
 * keeps its own copy, so a write on one is invisible to the next request if it
 * lands elsewhere.
 *
 * res.json() is intercepted so the response body is available for the log
 * entry, then replayed unchanged.
 */
export function withState(handler: ApiHandler): ApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const mutating = MUTATING_METHODS.has(req.method || "");

    const run = async () => {
      const startedAt = Date.now();
      const requestBody = mutating ? req.body : undefined;

      const sendJson = res.json.bind(res);
      let payload: unknown;
      let responded = false;
      res.json = ((body: unknown) => {
        payload = body;
        responded = true;
        return res;
      }) as NextApiResponse["json"];

      try {
        setNoCacheHeaders(res);

        await handler(req, res);

        // Built after the handler so `ms` covers it, and so `ok` can be read off
        // the response the handler produced.
        const skipLog = Boolean(req.headers[requestLog.SKIP_HEADER]);
        if (requestLog.ENABLED && !skipLog) {
          requestLog.append(
            requestLog.buildEntry({
              method: req.method || "?",
              path: req.url || "?",
              status: res.statusCode,
              payload,
              body: requestBody,
              startedAt,
              isMutation: mutating,
            })
          );
        }
      } finally {
        res.json = sendJson;
        if (responded) sendJson(payload);
      }
    };

    return mutating ? enqueueWrite(run) : run();
  };
}

export type { Order, Product, ReturnRecord, ReplacementRecord, OrderItem, Customer };
