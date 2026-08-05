import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS, allReturns } from "../../../../lib/state";
import { err } from "../../../../lib/helpers";

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

  const returns = allReturns()
    .filter((ret) => ret.customer_id === customerId)
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
