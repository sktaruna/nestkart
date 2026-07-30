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
export let STATUS_OVERRIDES: Record<string, string> = {};
export let PRODUCTS: Record<string, Product> = seedProducts();
export const RETURNS: Record<string, ReturnRecord> = seedReturns();

// runtime order IDs start at ORD-20000, well clear of seeded ORD-1xxxx IDs
export const orderCounter = { value: 20000 };
// runtime return IDs start at RET-2210
export const returnCounter = { value: 2210 };

export let SEED_ORDER_IDS: Set<string> = new Set();

const _ORIGINAL_STOCK: Record<string, number> = Object.fromEntries(
  Object.entries(seedProducts()).map(([pid, p]) => [pid, p.stock])
);

function seedOrders(): void {
  const now = new Date();
  const seeded = buildSeedOrders(now);
  ORDERS = { ...ORDERS, ...seeded };
  SEED_ORDER_IDS = new Set([...SEED_ORDER_IDS, ...Object.keys(seeded)]);
}

function resetAllState(): void {
  ORDERS = {};
  CARTS = {};
  DYNAMIC_RETURNS = {};
  STATUS_OVERRIDES = {};
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
  STATUS_OVERRIDES = {};
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
  status_overrides: Record<string, string>;
  order_counter: number;
  return_counter: number;
  product_stock: Record<string, number>;
}

function snapshotState(): Snapshot {
  return {
    orders: ORDERS,
    carts: CARTS,
    dynamic_returns: DYNAMIC_RETURNS,
    status_overrides: STATUS_OVERRIDES,
    order_counter: orderCounter.value,
    return_counter: returnCounter.value,
    product_stock: Object.fromEntries(Object.entries(PRODUCTS).map(([pid, p]) => [pid, p.stock])),
  };
}

function applyState(state: Partial<Snapshot>): void {
  ORDERS = (state.orders as Record<string, Order>) || {};
  CARTS = (state.carts as Record<string, CartItem[]>) || {};
  DYNAMIC_RETURNS = (state.dynamic_returns as Record<string, ReturnRecord>) || {};
  STATUS_OVERRIDES = (state.status_overrides as Record<string, string>) || {};
  orderCounter.value = state.order_counter ?? orderCounter.value;
  returnCounter.value = state.return_counter ?? returnCounter.value;
  const productStock = state.product_stock || {};
  for (const [pid, stock] of Object.entries(productStock)) {
    if (PRODUCTS[pid]) PRODUCTS[pid].stock = stock;
  }
}

async function loadSharedState(): Promise<void> {
  if (!store.ENABLED) return;
  const state = await store.loadState();
  if (state) {
    applyState(state as Partial<Snapshot>);
  }
}

async function saveSharedState(): Promise<void> {
  if (!store.ENABLED) return;
  await store.saveState(snapshotState() as unknown as Record<string, unknown>);
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

export type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => void | Promise<void>;

/**
 * Wraps an API route handler to:
 *  (a) load shared state from Redis before running business logic (no-op if
 *      store isn't configured — falls back to in-memory seed data),
 *  (b) run the handler,
 *  (c) save state after IF the request method was POST/PUT/PATCH/DELETE.
 *
 * Saving is intentionally skipped on GET: a read-only request that loaded a
 * slightly-older snapshot could otherwise resave it after a concurrent write
 * finished, silently clobbering that write (classic last-write-wins lost
 * update) — this mirrors a real bug already fixed in the Flask version.
 *
 * Step (c) must finish BEFORE the response reaches the client. Handlers call
 * res.json() themselves, which would flush the 200 while the Redis write was
 * still in flight — so a read fired right after (an admin refresh following a
 * cancellation, a cart GET after an add) could load a pre-write snapshot, and
 * because GETs never save, nothing would repair the stale view until the next
 * read. res.json() is therefore buffered here and replayed after the save.
 */
export function withState(handler: ApiHandler): ApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    await loadSharedState();
    setNoCacheHeaders(res);

    const sendJson = res.json.bind(res);
    let payload: unknown;
    let responded = false;
    res.json = ((body: unknown) => {
      payload = body;
      responded = true;
      return res;
    }) as NextApiResponse["json"];

    try {
      await handler(req, res);
      if (store.ENABLED && MUTATING_METHODS.has(req.method || "")) {
        await saveSharedState();
      }
    } finally {
      res.json = sendJson;
      if (responded) sendJson(payload);
    }
  };
}

export type { Order, Product, ReturnRecord, OrderItem };
export { CUSTOMERS };
