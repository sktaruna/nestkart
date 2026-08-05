import type { NextApiRequest, NextApiResponse } from "next";
import {
  withState,
  ORDERS,
  DYNAMIC_RETURNS,
  PRODUCTS,
  returnCounter,
  openReturnsForOrder,
} from "../../../../lib/state";
import {
  err,
  ownershipError,
  returnEligibilityCheck,
  addBusinessDays,
  getBody,
  dateOnly,
  today,
  formatInr,
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

  // One open return per order. A return covers every item in the order and is
  // refunded at the full order total, so a second one promises the customer the
  // order's value twice — and an agent that files again after a slow first
  // response is the likeliest way to get there. Closed returns (completed,
  // rejected) do not block: a rejected return should be re-fileable.
  const openReturns = openReturnsForOrder(orderId);
  if (openReturns.length > 0) {
    const existing = openReturns[0];
    res.status(400).json({
      ok: false,
      error: "return_already_open",
      message:
        `A return is already in progress for order ${orderId} (${existing.return_id}), ` +
        "and it covers the whole order. Tell the customer their return is already being " +
        "handled rather than filing another one.",
      open_return_ids: openReturns.map((ret) => ret.return_id),
      existing_return_id: existing.return_id,
      existing_return_status: existing.status,
      existing_refund_status: existing.refund_status,
    });
    return;
  }

  // A replacement already promises the customer a new unit for this order; a
  // return on top would refund the whole order as well, giving them both.
  if (order.replacement_requested) {
    res.status(400).json({
      ok: false,
      error: "replacement_already_requested",
      message: `A replacement has already been requested for order ${orderId}. A return cannot be filed while it is outstanding.`,
    });
    return;
  }

  const elig = returnEligibilityCheck(orderId);
  if (!elig.eligible) {
    res.status(400).json({ ok: false, error: "return_not_eligible", eligible: false, reason: elig.reason });
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

  // Damage claims are tracked on the ORDER, which is what /return-eligibility
  // reads to give free return shipping. The refund itself is not held — refund_status
  // is the only refund signal, and it stays 'pending' until an operator moves it.
  if (reason === "damaged on arrival") {
    order.damage_claim_active = true;
  }

  // Restore stock when return is initiated (only if this order decremented it).
  // The flag is cleared so the units go back exactly once: a rejected return can
  // be re-filed (see the open-return check above), and without this each re-file
  // invented another unit of every item on the order.
  if (order.stock_decremented) {
    for (const item of order.items || []) {
      const p = PRODUCTS[item.product_id];
      if (p) p.stock += item.qty;
    }
    order.stock_decremented = false;
  }

  const itemNames = (order.items || []).map((i) => i.product_name).join(", ");
  const refundEtaIso = dateOnly(refundEta);
  // The order total, formatted like the seeded returns (RET-2201 carries the
  // ₹89,999 of ORD-10101). Left null before, so every agent-filed return had no
  // answer to "how much do I get back?" while the amount was sitting on the
  // order. Shipping is not added on top: the seeds don't, and orders don't store
  // what shipping was charged, so any figure here would be invented.
  const refundAmount = formatInr(order.price_total);

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
    refund_amount: refundAmount,
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
    refund_amount: refundAmount,
    refund_status: "pending",
    estimated_refund_date: refundEtaIso,
  });
});
