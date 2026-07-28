import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, STATUS_OVERRIDES, SEED_ORDER_IDS } from "../../../../../lib/state";
import { err } from "../../../../../lib/helpers";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "DELETE") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const orderId = req.query.order_id as string;
  if (!(orderId in ORDERS)) {
    err(res, "order_not_found", `No order found with ID '${orderId}'.`, 404);
    return;
  }
  if (SEED_ORDER_IDS.has(orderId)) {
    err(res, "delete_not_allowed", "Seeded demo orders cannot be deleted.", 400);
    return;
  }

  delete ORDERS[orderId];
  delete STATUS_OVERRIDES[orderId];

  res.status(200).json({ ok: true, order_id: orderId, deleted: true });
});
