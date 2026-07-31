import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, DYNAMIC_RETURNS, PRODUCTS, returnCounter } from "../../../../lib/state";
import {
  err,
  ownershipError,
  returnEligibilityCheck,
  addBusinessDays,
  getBody,
  dateOnly,
  today,
} from "../../../../lib/helpers";

const ACCEPTED_REASONS = [
  "change of mind",
  "item not as described",
  "damaged on arrival",
  "defective",
  "wrong item received",
];
const ACCEPTED_CONDITIONS = ["unused", "opened", "assembled"];

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const orderId = req.query.order_id as string;
  if (!(orderId in ORDERS)) {
    err(res, "order_not_found", `No order found with ID '${orderId}'.`, 404);
    return;
  }
  const order = ORDERS[orderId];

  const body = getBody(req);
  const customerId = body.customer_id as string | undefined;
  const reason = body.return_reason as string | undefined;
  const condition = body.condition as string | undefined;
  const hasPkg = body.has_original_packaging;

  const missing: string[] = [];
  if (!customerId) missing.push("customer_id");
  if (!reason) missing.push("return_reason");
  if (!condition) missing.push("condition");
  if (hasPkg === undefined || hasPkg === null) missing.push("has_original_packaging");
  if (missing.length) {
    err(res, "missing_field", `Required field(s) missing: ${missing.join(", ")}.`, 400);
    return;
  }

  if (!ACCEPTED_REASONS.includes(reason as string)) {
    err(res, "invalid_reason", `Invalid reason. Accepted: ${ACCEPTED_REASONS.join(", ")}.`, 400);
    return;
  }
  if (!ACCEPTED_CONDITIONS.includes(condition as string)) {
    err(res, "invalid_condition", `Invalid condition. Accepted: ${ACCEPTED_CONDITIONS.join(", ")}.`, 400);
    return;
  }

  if (ownershipError(res, customerId, order.customer_id)) return;

  const elig = returnEligibilityCheck(orderId);
  if (!elig.eligible) {
    res.status(200).json({ ok: false, eligible: false, reason: elig.reason });
    return;
  }

  const returnId = `RET-${returnCounter.value}`;
  returnCounter.value += 1;
  const now = today();
  const refundEta = addBusinessDays(now, 7);
  const freeReturn = ["damaged on arrival", "defective", "wrong item received", "item not as described"].includes(
    reason as string
  );
  const inclShipping = freeReturn;

  if (reason === "damaged on arrival") {
    order.damage_claim_active = true;
  }

  // Restore stock when return is initiated (only if this order decremented it)
  if (order.stock_decremented) {
    for (const item of order.items || []) {
      const p = PRODUCTS[item.product_id];
      if (p) p.stock += item.qty;
    }
  }

  const itemNames = (order.items || []).map((i) => i.product_name).join(", ");
  const refundEtaIso = dateOnly(refundEta);

  DYNAMIC_RETURNS[returnId] = {
    return_id: returnId,
    order_id: orderId,
    customer_id: customerId as string,
    item_name: itemNames,
    reason: reason as string,
    status: "return_requested",
    return_initiated: dateOnly(now),
    return_received_date: null,
    refund_status: "pending",
    refund_amount: null,
    refund_includes_shipping: inclShipping,
    refund_estimated_date: refundEtaIso,
    refund_issued_date: null,
    refund_method: "original_payment_method",
    return_shipping: freeReturn ? "free" : "₹200–₹500 (customer pays)",
    condition: condition as string,
    has_original_packaging: Boolean(hasPkg),
  };

  res.status(200).json({
    ok: true,
    return_id: returnId,
    status: "return_requested",
    instructions:
      "Please repack the item securely and attach the return label to the outside. Drop off at any Delhivery or Blue Dart location within 14 days.",
    return_shipping_label_url: `https://returns.nestkart.com/label/${returnId}`,
    return_shipping_cost: freeReturn ? "free" : "₹200–₹500 (customer pays)",
    estimated_refund_date: refundEtaIso,
  });
});
