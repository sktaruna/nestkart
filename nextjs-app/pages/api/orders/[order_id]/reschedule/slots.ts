import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS } from "../../../../../lib/state";
import { err, weekdaySlots } from "../../../../../lib/helpers";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const orderId = req.query.order_id as string;
  if (!(orderId in ORDERS)) {
    err(res, "order_not_found", `No order found with ID '${orderId}'.`, 404);
    return;
  }

  res.status(200).json({ ok: true, slots: weekdaySlots() });
});
