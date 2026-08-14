import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, DYNAMIC_REPLACEMENTS, replacementCounter, openReturnsForOrder } from "../../../../lib/state";
import {
  err,
  ownershipError,
  addBusinessDays,
  getBody,
  replacementEligibilityCheck,
  dateOnly,
  today,
} from "../../../../lib/helpers";

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
  const reason = (body.reason as string | undefined) || "damaged on arrival";

  if (!customerId) {
    err(res, "missing_field", "Required field 'customer_id' is missing.", 400);
    return;
  }
  if (ownershipError(res, customerId, order.customer_id)) return;

  const eligibility = replacementEligibilityCheck(orderId);
  if (!eligibility.eligible) {
    res.status(400).json({
      ok: false,
      error: "replacement_not_eligible",
      message: eligibility.reason,
    });
    return;
  }

  // A return already covers the whole order and refunds it in full, so a
  // replacement on top would give the customer both the item and the money.
  const openReturns = openReturnsForOrder(orderId);
  if (openReturns.length > 0) {
    res.status(400).json({
      ok: false,
      error: "return_in_progress",
      message: `A return is already in progress for order ${orderId} (${openReturns[0].return_id}). A replacement cannot be requested while it is open.`,
      open_return_ids: openReturns.map((ret) => ret.return_id),
    });
    return;
  }

  if (order.replacement_requested) {
    res.status(400).json({
      ok: false,
      error: "replacement_already_requested",
      message: `A replacement has already been requested for order ${orderId}.`,
    });
    return;
  }

  const replacementId = `REP-${replacementCounter.value}`;
  replacementCounter.value += 1;
  const dispatchDate = addBusinessDays(today(), 5);
  const estimatedDispatchDate = dateOnly(dispatchDate);
  order.replacement_requested = true;

  const itemNames = (order.items || []).map((i) => i.product_name).join(", ");
  DYNAMIC_REPLACEMENTS[replacementId] = {
    replacement_id: replacementId,
    order_id: orderId,
    customer_id: customerId as string,
    item_name: itemNames,
    reason,
    status: "replacement_requested",
    requested_at: dateOnly(today()),
    estimated_dispatch_date: estimatedDispatchDate,
    dispatched_date: null,
    delivered_date: null,
    tracking_number: null,
  };

  res.status(200).json({
    ok: true,
    replacement_id: replacementId,
    status: "replacement_requested",
    estimated_dispatch_date: estimatedDispatchDate,
  });
});
