import type { NextApiRequest, NextApiResponse } from "next";
import { withState, findReplacement } from "../../../lib/state";
import { err } from "../../../lib/helpers";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const replacementId = req.query.replacement_id as string;
  const rep = findReplacement(replacementId);
  if (!rep) {
    err(res, "replacement_not_found", `No replacement found with ID '${replacementId}'.`, 404);
    return;
  }

  res.status(200).json({
    ok: true,
    replacement_id: rep.replacement_id,
    order_id: rep.order_id,
    customer_id: rep.customer_id,
    item_name: rep.item_name,
    reason: rep.reason.replace(/_/g, " "),
    status: rep.status,
    requested_at: rep.requested_at,
    estimated_dispatch_date: rep.estimated_dispatch_date,
    dispatched_date: rep.dispatched_date,
    delivered_date: rep.delivered_date,
    tracking_number: rep.tracking_number,
  });
});
