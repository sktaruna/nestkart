import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, PRODUCTS, openReturnsForOrder } from "../../../../lib/state";
import { err, ownershipError, getOrderStatus, getBody } from "../../../../lib/helpers";

const ACCEPTED_REASONS = [
  "changed my mind",
  "ordered by mistake",
  "found better price",
  "delivery too slow",
  "other",
];

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const orderId = req.query.order_id as string;
  const order = ORDERS[orderId];
  if (!order) {
    err(res, "order_not_found", `No order found with ID '${orderId}'.`, 404);
    return;
  }

  const body = getBody(req);
  const customerId = body.customer_id as string | undefined;
  const reason = body.reason as string | undefined;

  if (!customerId) {
    err(res, "missing_field", "Required field 'customer_id' is missing.", 400);
    return;
  }
  if (ownershipError(res, customerId, order.customer_id)) return;

  if (!reason) {
    err(res, "missing_field", "Required field 'reason' is missing.", 400);
    return;
  }
  if (!ACCEPTED_REASONS.includes(reason)) {
    err(res, "invalid_reason", `Invalid reason. Accepted: ${ACCEPTED_REASONS.join(", ")}.`, 400);
    return;
  }

  const status = getOrderStatus(order);
  if (status !== "processing") {
    res.status(400).json({
      ok: false,
      error: "order_not_cancellable",
      cancelled: false,
      reason: `Order can only be cancelled while it is processing (current: ${status}).`,
      current_status: status,
    });
    return;
  }

  // An order with a return in flight must not also be cancelled: that would
  // refund the same item twice, once as a cancellation and once as a return.
  // Reachable because order status and returns are independent — rewinding a
  // delivered order to `processing` leaves its return open and the order
  // cancellable again.
  const openReturns = openReturnsForOrder(orderId);
  if (openReturns.length > 0) {
    res.status(400).json({
      ok: false,
      error: "return_in_progress",
      cancelled: false,
      reason: "A return is already in progress for this order, so it cannot be cancelled.",
      current_status: status,
      open_return_ids: openReturns.map((ret) => ret.return_id),
    });
    return;
  }

  // A replacement already promises the customer a new unit for this order, and
  // cancelling refunds the order in full — together they hand over both the goods
  // and the money. Same reasoning as the check in returns.ts, which refuses a
  // return for exactly this reason; cancelling is the other way to get the refund.
  if (order.replacement_requested) {
    res.status(400).json({
      ok: false,
      error: "replacement_already_requested",
      cancelled: false,
      reason: `A replacement has already been requested for order ${orderId}, so it cannot also be cancelled.`,
      current_status: status,
    });
    return;
  }

  order.cancelled = true;
  order.status = "cancelled";

  // Restore stock only for orders that went through checkout (not seeded orders).
  // Clearing the flag is what makes this restore happen at most once: the return
  // path restores from the same flag, and a cancel after a closed return would
  // otherwise put the same units back a second time.
  if (order.stock_decremented) {
    for (const item of order.items || []) {
      const p = PRODUCTS[item.product_id];
      if (p) p.stock += item.qty;
    }
    order.stock_decremented = false;
  }

  res.status(200).json({
    ok: true,
    cancelled: true,
    order_id: orderId,
    refund_method: "original_payment_method",
    refund_timeline:
      "5–7 business days to your original payment method, plus 2–5 business days for your bank to process.",
  });
});
