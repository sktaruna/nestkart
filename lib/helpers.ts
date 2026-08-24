import type { NextApiResponse } from "next";
import { Order } from "./data";
import { ORDERS, PRODUCTS, SEED_ORDER_IDS, openReturnsForOrder, completedReturnsForOrder, allReturns } from "./state";

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC RESPONSE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
export function err(res: NextApiResponse, errorCode: string, message: string, status = 400): void {
  res.status(status).json({ ok: false, error: errorCode, message });
}

/** Returns true (and writes the 403 response) if there's an ownership mismatch. */
export function ownershipError(res: NextApiResponse, providedId: unknown, actualId: string): boolean {
  if (providedId !== actualId) {
    res.status(403).json({
      ok: false,
      error: "ownership_mismatch",
      message: "The provided customer_id does not match the verified owner of this resource.",
    });
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER STATUS — STORED, NEVER DERIVED
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Reads the status recorded on the order. An order only advances when the admin
 * panel (or the set-status / cancel API) writes a new one — time since
 * `placed_at` never moves it. Orders default to "processing" at checkout.
 */
export function getOrderStatus(order: Order): string {
  if (order.cancelled) return "cancelled";
  return order.status || "processing";
}

export function trackingInfo(order: Order): [string | null, string | null] {
  const status = getOrderStatus(order);
  if (status === "dispatched" || status === "in_transit" || status === "delivered") {
    const tn = order.tracking_number || `NK${order.order_id.replace("ORD-", "")}TRACK`;
    return [tn, `https://track.nestkart.com/${tn}`];
  }
  return [null, null];
}

export function deriveStockStatus(stock: number): string {
  if (stock === 0) return "out_of_stock";
  if (stock <= 3) return "low_stock";
  return "in_stock";
}

/** Format integer as ₹1,24,000 (Indian numbering) */
export function formatInr(amount: number): string {
  const s = String(Math.trunc(amount));
  if (s.length <= 3) return `₹${s}`;
  let result = s.slice(-3);
  let rest = s.slice(0, -3);
  while (rest.length > 0) {
    result = rest.slice(-2) + "," + result;
    rest = rest.slice(0, -2);
  }
  return `₹${result}`;
}

/**
 * YYYY-MM-DD in the server's local timezone.
 *
 * NOT `toISOString().slice(0, 10)`: dates here are built from local midnight
 * (`setHours(0,0,0,0)`), and in any timezone ahead of UTC that instant lands on
 * the *previous* UTC day — so a refund issued today was reported as issued
 * yesterday, and weekdaySlots() could offer a slot starting in the past.
 */
export function dateOnly(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Local midnight today — the base for every date-only calculation. */
export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 7 weekday delivery slots, within 14 days of wherever they start.
 *
 * `currentEta` anchors them: slots begin the day AFTER the delivery already
 * promised, because a courier cannot bring a delivery forward and there is no
 * point offering the date the order is already booked for. Without the anchor
 * this returned "7 weekdays from tomorrow" for every order, so a dispatched
 * large_item with a 10-day ETA was offered nothing but dates earlier than its
 * own delivery — every "reschedule" moved the delivery earlier, never later.
 *
 * Falls back to starting tomorrow when the ETA is missing or already past, so
 * an order whose date has slipped can still be rescheduled.
 */
export function weekdaySlots(currentEta?: string | null): string[] {
  const base = today();
  const tomorrow = new Date(base.getTime() + 24 * 60 * 60 * 1000);

  let start = tomorrow;
  if (currentEta) {
    const eta = new Date(currentEta + "T00:00:00");
    const dayAfterEta = new Date(eta.getTime() + 24 * 60 * 60 * 1000);
    if (!Number.isNaN(eta.getTime()) && dayAfterEta.getTime() > tomorrow.getTime()) {
      start = dayAfterEta;
    }
  }

  const slots: string[] = [];
  let d = start;
  const limit = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  while (slots.length < 7 && d.getTime() <= limit.getTime()) {
    const day = d.getDay(); // 0=Sun..6=Sat
    if (day >= 1 && day <= 5) {
      slots.push(dateOnly(d));
    }
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return slots;
}

export function addBusinessDays(startDate: Date, days: number): Date {
  let current = new Date(startDate.getTime());
  let added = 0;
  while (added < days) {
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    const day = current.getDay();
    if (day >= 1 && day <= 5) added += 1;
  }
  return current;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER RESPONSE BUILDER
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return ids filed against `orderId`, newest-initiated first.
 *
 * Read from allReturns() on every call rather than stored on the order, so the
 * answer follows the returns as they are filed, closed and deleted — an order has
 * no field of its own that could go stale against DYNAMIC_RETURNS.
 */
export function returnIdsForOrder(orderId: string): string[] {
  return allReturns()
    .filter((ret) => ret.order_id === orderId)
    .map((ret) => ret.return_id);
}

/**
 * The order itself, with nothing envelope-shaped on it.
 *
 * No `ok` and no `customer_id`: both are right for GET /orders/{id}, which adds
 * them, and both were noise in the list endpoints — `ok` is a per-response flag
 * that means nothing on an array element, and every order in a customer's list
 * belongs to the customer already named on the envelope. No `is_seed` either;
 * that is admin metadata, added by the admin endpoints the same way
 * /api/admin/returns does it.
 */
export function buildOrderResponse(order: Order): Record<string, unknown> {
  const status = getOrderStatus(order);
  const [tn, tUrl] = trackingInfo(order);
  return {
    order_id: order.order_id,
    items: order.items || [],
    item_summary: (order.items || []).map((i) => `${i.product_name} x${i.qty}`).join(", "),
    price_total: order.price_total,
    price_total_formatted: formatInr(order.price_total),
    placed_at: order.placed_at,
    status,
    shipping_method: order.shipping_method,
    estimated_delivery: order.estimated_delivery ?? null,
    delivery_address: order.delivery_address ?? null,
    damage_claim_active: order.damage_claim_active ?? false,
    tracking_number: tn,
    tracking_url: tUrl,
    // Every return ever filed against this order, newest first, as one flat
    // string — `""` when there are none. Joined rather than nested because an
    // order can carry more than one (a rejected return can be re-filed) and this
    // object is meant to be read straight through; the array form lives on the
    // customer-orders envelope. Same treatment as `item_summary` above.
    //
    // There is no GET /orders/{id}/returns — that path is POST-only — so without
    // this the only way to find an order's returns was to list the customer's and
    // filter by order_id. Closed returns are included: "you returned this once
    // already" is worth knowing, and `returnable` is what says whether another one
    // can be filed.
    return_id: returnIdsForOrder(order.order_id).join(", "),
    ...orderActions(order),
  };
}

/**
 * Whether each customer-initiated action would be accepted right now.
 *
 * Only `reschedulable` could previously be worked out from the order — it is
 * status alone. The other three depend on facts the order does not carry: an
 * open return (which blocks cancel, return and replacement) and
 * `replacement_requested` (which is exposed nowhere at all). /return-eligibility
 * looked like the answer for `returnable` but checks only delivery, cancellation
 * and the 30-day window, so it reported `eligible: true` on orders where filing
 * was certain to 400. The agent's only way to find out was to attempt the action
 * and read the refusal — after it had already told the customer yes.
 *
 * Booleans only. The endpoint still explains itself when it refuses, so the
 * "why" is one failed call away; this is for deciding what to offer.
 *
 * These mirror the guards in cancel.ts, reschedule.ts, returns.ts and
 * replacement.ts. Change one of those and change this.
 */
export function orderActions(order: Order): Record<string, boolean> {
  const status = getOrderStatus(order);
  const hasOpenReturn = openReturnsForOrder(order.order_id).length > 0;

  // Both refunds-or-goods already promised for this order. An open return refunds
  // it in full; a replacement owes a new unit. Cancelling adds a second refund on
  // top of either, so both block it as well as blocking each other.
  const alreadyPromised = hasOpenReturn || Boolean(order.replacement_requested);

  // cancel.ts: processing only, and not while a return or replacement is in
  // flight — cancelling then pays for the same item twice.
  const cancellable = status === "processing" && !alreadyPromised;

  // reschedule.ts: nothing to reschedule once it has arrived, once it is on its
  // way back to us, or once the delivery it would move is not the live one.
  const reschedulable =
    (status === "processing" || status === "dispatched") && !alreadyPromised;

  // returns.ts also refuses an order that has already been returned and
  // refunded. That is not "promised" — it is spent — so it blocks returning
  // only, and never clears the way an open return does.
  const alreadyReturned = completedReturnsForOrder(order.order_id).length > 0;

  const returnable =
    returnEligibilityCheck(order.order_id).eligible && !alreadyPromised && !alreadyReturned;

  // replacement.ts: delivered, within window, AND an active damage claim —
  // deliberately narrower than returnable. A return covers "change of mind"
  // too; a replacement only makes sense when the item itself is the problem.
  const replaceable = replacementEligibilityCheck(order.order_id).eligible && !alreadyPromised;

  return { cancellable, reschedulable, returnable, replaceable };
}

/** buildOrderResponse plus the admin-only seed marker. */
export function buildAdminOrderResponse(order: Order): Record<string, unknown> {
  return {
    ...buildOrderResponse(order),
    customer_id: order.customer_id,
    is_seed: SEED_ORDER_IDS.has(order.order_id),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RETURN ELIGIBILITY
// ─────────────────────────────────────────────────────────────────────────────
export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  return_window_days: number | null;
  return_window_expires_on: string | null;
  days_remaining: number | null;
  return_shipping_cost: string | null;
}

export function returnEligibilityCheck(orderId: string): EligibilityResult {
  const order = ORDERS[orderId] || ({} as Order);
  const status = getOrderStatus(order);

  if (status === "processing" || status === "dispatched" || status === "in_transit") {
    return {
      eligible: false,
      reason: "Order has not yet been delivered. Return can only be initiated after confirmed delivery.",
      return_window_days: 30,
      return_window_expires_on: null,
      days_remaining: null,
      return_shipping_cost: "₹200–₹500 estimated",
    };
  }

  if (status === "cancelled") {
    return {
      eligible: false,
      reason: "Order was cancelled and cannot be returned.",
      return_window_days: null,
      return_window_expires_on: null,
      days_remaining: null,
      return_shipping_cost: null,
    };
  }

  // Delivered — check 30-day window from estimated_delivery. The window gates
  // a damage claim too: the claim earns free return shipping and its own
  // wording, but it does not extend the deadline. It used to be checked first
  // and short-circuit with eligible:true, so a claim kept an order returnable
  // forever — while replacementEligibilityCheck applied the window after the
  // claim and refused. The same order came back replaceable:false but
  // returnable:true, which is the disagreement this removes.
  const estDelivery = order.estimated_delivery;
  if (estDelivery) {
    const deliveryDate = new Date(estDelivery + "T00:00:00");
    const windowDays = 30;
    const expiryDate = new Date(deliveryDate.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.round((expiryDate.getTime() - today().getTime()) / (24 * 60 * 60 * 1000));

    if (daysRemaining <= 0) {
      return {
        eligible: false,
        reason: `Return window expired on ${dateOnly(expiryDate)}. The 30-day window from estimated delivery has elapsed.`,
        return_window_days: windowDays,
        return_window_expires_on: dateOnly(expiryDate),
        days_remaining: 0,
        return_shipping_cost: "₹200–₹500 estimated",
      };
    }
    if (order.damage_claim_active) {
      return {
        eligible: true,
        reason:
          "Item was reported damaged on arrival. Active damage claim under review " +
          `(${daysRemaining} days remaining in the 30-day window).`,
        return_window_days: windowDays,
        return_window_expires_on: dateOnly(expiryDate),
        days_remaining: daysRemaining,
        return_shipping_cost: "free",
      };
    }

    return {
      eligible: true,
      reason: `Item is within the 30-day return window (${daysRemaining} days remaining).`,
      return_window_days: windowDays,
      return_window_expires_on: dateOnly(expiryDate),
      days_remaining: daysRemaining,
      return_shipping_cost: "free (defective/damaged); ₹200–₹500 customer pays (change of mind)",
    };
  }

  return {
    eligible: false,
    reason: "Return eligibility could not be determined.",
    return_window_days: null,
    return_window_expires_on: null,
    days_remaining: null,
    return_shipping_cost: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLACEMENT ELIGIBILITY
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Narrower than returnEligibilityCheck(): a replacement is only offered when
 * the item itself is the problem, so it requires an active damage claim on
 * top of every gate a return needs (delivered, within the 30-day window).
 * `already requested` is checked separately by orderActions()/the endpoint,
 * same as it is for returns, so this only answers "could a replacement be
 * requested on this order at all right now".
 */
export function replacementEligibilityCheck(orderId: string): EligibilityResult {
  const order = ORDERS[orderId] || ({} as Order);
  const status = getOrderStatus(order);

  if (status === "processing" || status === "dispatched" || status === "in_transit") {
    return {
      eligible: false,
      reason: "Order has not yet been delivered. A replacement can only be requested after confirmed delivery.",
      return_window_days: 30,
      return_window_expires_on: null,
      days_remaining: null,
      return_shipping_cost: null,
    };
  }

  if (status === "cancelled") {
    return {
      eligible: false,
      reason: "Order was cancelled and is not eligible for a replacement.",
      return_window_days: null,
      return_window_expires_on: null,
      days_remaining: null,
      return_shipping_cost: null,
    };
  }

  if (!order.damage_claim_active) {
    return {
      eligible: false,
      reason: "No active damage claim on this order. A replacement is only offered when the item was reported damaged on arrival.",
      return_window_days: null,
      return_window_expires_on: null,
      days_remaining: null,
      return_shipping_cost: null,
    };
  }

  // Delivered with an active damage claim — still bounded by the same 30-day
  // window as a return, so a claim doesn't keep an order replaceable forever.
  const estDelivery = order.estimated_delivery;
  if (estDelivery) {
    const deliveryDate = new Date(estDelivery + "T00:00:00");
    const windowDays = 30;
    const expiryDate = new Date(deliveryDate.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.round((expiryDate.getTime() - today().getTime()) / (24 * 60 * 60 * 1000));

    if (daysRemaining <= 0) {
      return {
        eligible: false,
        reason: `Return/replacement window expired on ${dateOnly(expiryDate)}. The 30-day window from estimated delivery has elapsed.`,
        return_window_days: windowDays,
        return_window_expires_on: dateOnly(expiryDate),
        days_remaining: 0,
        return_shipping_cost: null,
      };
    }
    return {
      eligible: true,
      reason: `Item was reported damaged on arrival and is within the 30-day window (${daysRemaining} days remaining).`,
      return_window_days: windowDays,
      return_window_expires_on: dateOnly(expiryDate),
      days_remaining: daysRemaining,
      return_shipping_cost: "free",
    };
  }

  return {
    eligible: false,
    reason: "Replacement eligibility could not be determined.",
    return_window_days: null,
    return_window_expires_on: null,
    days_remaining: null,
    return_shipping_cost: null,
  };
}

export function getBody(req: { body: unknown }): Record<string, unknown> {
  const b = req.body;
  if (b && typeof b === "object") return b as Record<string, unknown>;
  return {};
}

export { PRODUCTS };
