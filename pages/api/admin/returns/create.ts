import type { NextApiRequest, NextApiResponse } from "next";
import {
  withState,
  ORDERS,
  DYNAMIC_RETURNS,
  PRODUCTS,
  returnCounter,
  openReturnsForOrder,
} from "../../../../lib/state";
import { err, addBusinessDays, getBody, dateOnly, today, formatInr } from "../../../../lib/helpers";

// Mirrors ACCEPTED_REASONS in pages/api/orders/[order_id]/returns.ts, so an
// admin-filed return carries the same free-shipping/refund rules as a
// customer-filed one.
const ACCEPTED_REASONS = [
  "change of mind",
  "item not as described",
  "damaged on arrival",
  "defective",
  "wrong item received",
];

/**
 * Admin-initiated return. Same record shape and side effects as the
 * customer-facing POST /orders/{order_id}/returns, but without the checks
 * that only make sense for a self-service request: no ownership match (the
 * admin isn't the customer), no delivery/30-day eligibility gate (the admin
 * is overriding, not asking), no condition/packaging fields (nobody has
 * inspected the item yet). The one-open-return-per-order and
 * already-has-a-replacement guards still apply — those protect the order's
 * refund/replacement bookkeeping, not the customer's self-service window.
 */
export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const body = getBody(req);
  const orderId = body.order_id as string | undefined;
  const reason = body.reason as string | undefined;

  if (!orderId) {
    err(res, "missing_field", "Required field(s) missing: order_id.", 400);
    return;
  }
  if (!(orderId in ORDERS)) {
    err(res, "order_not_found", `No order found with ID '${orderId}'.`, 404);
    return;
  }
  if (!reason) {
    err(res, "missing_field", "Required field(s) missing: reason.", 400);
    return;
  }
  if (!ACCEPTED_REASONS.includes(reason)) {
    err(res, "invalid_reason", `Invalid reason. Accepted: ${ACCEPTED_REASONS.join(", ")}.`, 400);
    return;
  }

  const order = ORDERS[orderId];

  const openReturns = openReturnsForOrder(orderId);
  if (openReturns.length > 0) {
    const existing = openReturns[0];
    res.status(400).json({
      ok: false,
      error: "return_already_open",
      message: `A return is already in progress for order ${orderId} (${existing.return_id}).`,
      existing_return_id: existing.return_id,
    });
    return;
  }

  if (order.replacement_requested) {
    res.status(400).json({
      ok: false,
      error: "replacement_already_requested",
      message: `A replacement has already been requested for order ${orderId}. A return cannot be filed while it is outstanding.`,
    });
    return;
  }

  const returnId = `RET-${returnCounter.value}`;
  returnCounter.value += 1;
  const now = today();
  const refundEta = addBusinessDays(now, 7);
  const freeReturn = ["damaged on arrival", "defective", "wrong item received", "item not as described"].includes(
    reason
  );

  if (reason === "damaged on arrival") {
    order.damage_claim_active = true;
  }

  // Same stock-restoration rule as the customer flow: only give back units
  // this order actually decremented, and only once.
  if (order.stock_decremented) {
    for (const item of order.items || []) {
      const p = PRODUCTS[item.product_id];
      if (p) p.stock += item.qty;
    }
    order.stock_decremented = false;
  }

  const itemNames = (order.items || []).map((i) => i.product_name).join(", ");
  const refundAmount = formatInr(order.price_total);

  DYNAMIC_RETURNS[returnId] = {
    return_id: returnId,
    order_id: orderId,
    customer_id: order.customer_id,
    item_name: itemNames,
    reason,
    status: "return_requested",
    return_initiated: dateOnly(now),
    return_received_date: null,
    refund_status: "pending",
    refund_amount: refundAmount,
    refund_includes_shipping: freeReturn,
    refund_estimated_date: dateOnly(refundEta),
    refund_issued_date: null,
    refund_method: "original_payment_method",
    return_shipping: freeReturn ? "free" : "₹200–₹500 (customer pays)",
  };

  res.status(200).json({ ok: true, return_id: returnId, status: "return_requested" });
});
