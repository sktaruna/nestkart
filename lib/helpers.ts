import type { NextApiResponse } from "next";
import { Order } from "./data";
import { ORDERS, PRODUCTS, SEED_ORDER_IDS } from "./state";

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

export function isCancellable(order: Order): boolean {
  return getOrderStatus(order) === "processing";
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

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Return 7 weekday delivery dates starting tomorrow, within +14 days. */
export function weekdaySlots(): string[] {
  const slots: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const limit = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
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
export function buildOrderResponse(order: Order): Record<string, unknown> {
  const status = getOrderStatus(order);
  const [tn, tUrl] = trackingInfo(order);
  return {
    ok: true,
    order_id: order.order_id,
    customer_id: order.customer_id,
    items: order.items || [],
    price_total: order.price_total,
    price_total_formatted: formatInr(order.price_total),
    placed_at: order.placed_at,
    status,
    shipping_method: order.shipping_method,
    estimated_delivery: order.estimated_delivery ?? null,
    delivery_address: order.delivery_address ?? null,
    damage_claim_active: order.damage_claim_active ?? false,
    cancellable: status === "processing",
    tracking_number: tn,
    tracking_url: tUrl,
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
  refund_locked?: boolean;
  refund_locked_reason?: string;
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

  if (order.damage_claim_active) {
    return {
      eligible: true,
      reason: "Item was reported damaged on arrival. Active damage claim under review.",
      return_window_days: 30,
      return_window_expires_on: null,
      days_remaining: null,
      return_shipping_cost: "free",
      refund_locked: true,
      refund_locked_reason: "damage_claim_under_review",
    };
  }

  // Delivered — check 30-day window from estimated_delivery
  const estDelivery = order.estimated_delivery;
  if (estDelivery) {
    const deliveryDate = new Date(estDelivery + "T00:00:00");
    const windowDays = 30;
    const expiryDate = new Date(deliveryDate.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysRemaining = Math.round((expiryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

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

export function getBody(req: { body: unknown }): Record<string, unknown> {
  const b = req.body;
  if (b && typeof b === "object") return b as Record<string, unknown>;
  return {};
}

export { PRODUCTS };
