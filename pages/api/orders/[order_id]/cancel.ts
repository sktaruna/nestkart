import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, STATUS_OVERRIDES, PRODUCTS } from "../../../../lib/state";
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
    res.status(200).json({
      ok: false,
      cancelled: false,
      reason: "order not cancellable",
      current_status: status,
    });
    return;
  }

  order.cancelled = true;
  STATUS_OVERRIDES[orderId] = "cancelled";

  // Restore stock only for orders that went through checkout (not seeded orders)
  if (order.stock_decremented) {
    for (const item of order.items || []) {
      const p = PRODUCTS[item.product_id];
      if (p) p.stock += item.qty;
    }
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
