import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS } from "../../../../../lib/state";
import { err, getOrderStatus, weekdaySlots } from "../../../../../lib/helpers";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const orderId = req.query.order_id as string;
  const order = ORDERS[orderId];
  if (!order) {
    err(res, "order_not_found", `No order found with ID '${orderId}'.`, 404);
    return;
  }

  // Mirrors the check in POST /reschedule, so a caller doesn't get a normal
  // slot list here only to have every one of them refused on the write.
  const status = getOrderStatus(order);
  if (status !== "processing" && status !== "dispatched") {
    res.status(400).json({
      ok: false,
      error: "reschedule_not_allowed",
      message: `Reschedule is only allowed for processing or dispatched orders (current: ${status}).`,
    });
    return;
  }

  res.status(200).json({ ok: true, slots: weekdaySlots(order.estimated_delivery) });
});
