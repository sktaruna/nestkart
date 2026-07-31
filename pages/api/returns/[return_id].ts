import type { NextApiRequest, NextApiResponse } from "next";
import { withState, findReturn } from "../../../lib/state";
import { err } from "../../../lib/helpers";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const returnId = req.query.return_id as string;
  const ret = findReturn(returnId);
  if (!ret) {
    err(res, "return_not_found", `No return found with ID '${returnId}'.`, 404);
    return;
  }

  const resp: Record<string, unknown> = {
    ok: true,
    return_id: ret.return_id,
    order_id: ret.order_id,
    // Was omitted here while every other view of a return carries it, so an agent
    // handed a return ID had no way to confirm it belonged to the customer it was
    // talking to — it had to list the customer's returns and search for the ID.
    customer_id: ret.customer_id,
    item_name: ret.item_name,
    reason: ret.reason.replace(/_/g, " "),
    status: ret.status,
    return_initiated: ret.return_initiated,
    return_received_date: ret.return_received_date ?? null,
    refund_status: ret.refund_status,
    refund_amount: ret.refund_amount ?? null,
    refund_includes_shipping: ret.refund_includes_shipping ?? null,
    refund_method: ret.refund_method,
    refund_estimated_date: ret.refund_estimated_date ?? null,
    refund_issued_date: ret.refund_issued_date ?? null,
  };

  if (ret.refund_locked) {
    resp.refund_locked = true;
    resp.refund_locked_reason = ret.refund_locked_reason;
  }
  if (ret.requires_agent_escalation) {
    resp.requires_agent_escalation = true;
    resp.escalation_reason = ret.escalation_reason;
  }

  res.status(200).json(resp);
});
