import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS, allReturns } from "../../../../lib/state";
import { RETURN_STATUSES } from "../../../../lib/data";
import { err } from "../../../../lib/helpers";

type ReturnStatus = (typeof RETURN_STATUSES)[number];

/**
 * Lists a customer's returns, newest first.
 *
 * Without this, GET /api/returns/:id was the only way in — so an agent could
 * only look up a return whose ID the customer happened to recite. "Where's my
 * refund?" had no answerable call.
 */
export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const customerId = req.query.customer_id as string;
  if (!(customerId in CUSTOMERS)) {
    err(res, "customer_not_found", `No customer found with ID '${customerId}'.`, 404);
    return;
  }

  // Rejected rather than ignored, for the same reason as the orders list: an
  // ignored filter looks like an empty result set to the caller.
  const status = req.query.status as string | undefined;
  if (status !== undefined && !RETURN_STATUSES.includes(status as ReturnStatus)) {
    err(
      res,
      "invalid_status",
      `'${status}' is not a valid return status. Expected one of: ${RETURN_STATUSES.join(", ")}.`,
      400
    );
    return;
  }

  const returns = allReturns()
    .filter((ret) => ret.customer_id === customerId)
    .filter((ret) => !status || ret.status === status)
    .map((ret) => {
      return {
        return_id: ret.return_id,
        order_id: ret.order_id,
        item_name: ret.item_name,
        reason: ret.reason.replace(/_/g, " "),
        status: ret.status,
        return_initiated: ret.return_initiated,
        return_received_date: ret.return_received_date ?? null,
        refund_status: ret.refund_status,
        refund_amount: ret.refund_amount ?? null,
        refund_estimated_date: ret.refund_estimated_date ?? null,
        refund_issued_date: ret.refund_issued_date ?? null,
      };
    });

  res.status(200).json({
    ok: true,
    customer_id: customerId,
    total_returns: returns.length,
    return_ids: returns.map((r) => r.return_id),
    returns,
  });
});
