import type { NextApiRequest, NextApiResponse } from "next";
import { withState, mutableReturn, ORDERS, openReturnsForOrder } from "../../../../../lib/state";
import { err, getBody, addBusinessDays, dateOnly, today } from "../../../../../lib/helpers";
import { RETURN_STATUSES, REFUND_STATUSES } from "../../../../../lib/data";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const returnId = req.query.return_id as string;
  const ret = mutableReturn(returnId);
  if (!ret) {
    err(res, "return_not_found", `No return found with ID '${returnId}'.`, 404);
    return;
  }

  const body = getBody(req);
  const status = body.status as string | undefined;
  const refundStatus = body.refund_status as string | undefined;

  if (status === undefined && refundStatus === undefined) {
    err(res, "missing_field", "Provide at least one of 'status' or 'refund_status'.", 400);
    return;
  }
  if (status !== undefined && !RETURN_STATUSES.includes(status as never)) {
    err(res, "invalid_status", `status must be one of: ${RETURN_STATUSES.join(", ")}.`, 400);
    return;
  }
  if (refundStatus !== undefined && !REFUND_STATUSES.includes(refundStatus as never)) {
    err(res, "invalid_refund_status", `refund_status must be one of: ${REFUND_STATUSES.join(", ")}.`, 400);
    return;
  }

  // Dates are filled in as the return progresses, matching the shape the seeded
  // returns already have — a return_received with no return_received_date, or an
  // issued refund with no refund_issued_date, would read as a data bug to the
  // agent under test.
  if (status !== undefined) {
    ret.status = status;
    if ((status === "return_received" || status === "under_review") && !ret.return_received_date) {
      ret.return_received_date = dateOnly(today());
    }
    if (status === "return_requested" || status === "return_in_transit") {
      ret.return_received_date = null;
    }
  }

  // Closing a return (completed / rejected) has to release the order's damage
  // claim, the same way deleting the return does. Left set, the claim outlived
  // the return that opened it: returnEligibilityCheck tests the flag before the
  // 30-day window, so a rejected damage claim kept the order returnable forever
  // with free shipping and a permanently locked refund.
  let damageClaimCleared = false;
  const order = ORDERS[ret.order_id];
  if (order?.damage_claim_active) {
    const stillClaimed = openReturnsForOrder(ret.order_id).some(
      (r) => r.reason === "damaged on arrival"
    );
    if (!stillClaimed) {
      order.damage_claim_active = false;
      damageClaimCleared = true;
    }
  }

  if (refundStatus !== undefined) {
    ret.refund_status = refundStatus;
    if (refundStatus === "processing" && !ret.refund_estimated_date) {
      ret.refund_estimated_date = dateOnly(addBusinessDays(today(), 7));
    }
    if (refundStatus === "issued") {
      ret.refund_issued_date = dateOnly(today());
      // An issued refund cannot still be held for review; leaving the lock on
      // would let the agent read "refunded" and "refund_locked" at once.
      ret.refund_locked = false;
      ret.refund_locked_reason = undefined;
    } else {
      ret.refund_issued_date = null;
    }
    if (refundStatus === "pending") {
      ret.refund_estimated_date = null;
    }
  }

  res.status(200).json({
    ok: true,
    return_id: returnId,
    status: ret.status,
    refund_status: ret.refund_status,
    return_received_date: ret.return_received_date,
    refund_estimated_date: ret.refund_estimated_date,
    refund_issued_date: ret.refund_issued_date,
    ...(damageClaimCleared ? { damage_claim_cleared: true } : {}),
  });
});
