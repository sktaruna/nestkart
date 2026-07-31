import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, returnCounter } from "../../../../lib/state";
import {
  err,
  ownershipError,
  addBusinessDays,
  getBody,
  returnEligibilityCheck,
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
  // reason / description accepted but unused, mirroring app.py which reads
  // them but never validates or stores them for this endpoint.

  if (!customerId) {
    err(res, "missing_field", "Required field 'customer_id' is missing.", 400);
    return;
  }
  if (ownershipError(res, customerId, order.customer_id)) return;

  const eligibility = returnEligibilityCheck(orderId);
  if (!eligibility.eligible) {
    res.status(400).json({
      ok: false,
      error: "replacement_not_eligible",
      message: `Replacement is only available for orders eligible for return. ${eligibility.reason}`,
    });
    return;
  }

  const replacementId = `REP-${returnCounter.value}`;
  returnCounter.value += 1;
  const dispatchDate = addBusinessDays(today(), 5);

  res.status(200).json({
    ok: true,
    replacement_id: replacementId,
    status: "replacement_requested",
    estimated_dispatch_date: dateOnly(dispatchDate),
  });
});
