import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, openReturnsForOrder } from "../../../../lib/state";
import { err, ownershipError, getOrderStatus, weekdaySlots, getBody } from "../../../../lib/helpers";

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
  const newDate = body.new_date as string | undefined;

  if (!customerId) {
    err(res, "missing_field", "Required field 'customer_id' is missing.", 400);
    return;
  }
  if (ownershipError(res, customerId, order.customer_id)) return;

  const status = getOrderStatus(order);
  if (status !== "processing" && status !== "dispatched") {
    res.status(400).json({
      ok: false,
      error: "reschedule_not_allowed",
      message: `Reschedule is only allowed for processing or dispatched orders (current: ${status}).`,
    });
    return;
  }

  // An order on its way back to us has no delivery to move. Reachable because
  // order status and returns are independent: a return can only be filed once the
  // order is delivered, but rewinding it to processing/dispatched afterwards
  // leaves the return open and this endpoint willing. Rescheduling then also
  // rewrites `estimated_delivery`, which anchors the 30-day return window, so it
  // silently restarts the window on an order already being returned.
  const openReturns = openReturnsForOrder(orderId);
  if (openReturns.length > 0) {
    res.status(400).json({
      ok: false,
      error: "return_in_progress",
      message: `A return is already in progress for order ${orderId} (${openReturns[0].return_id}), so its delivery cannot be rescheduled.`,
      open_return_ids: openReturns.map((ret) => ret.return_id),
    });
    return;
  }

  // A replacement is a fresh unit with its own dispatch date, and nothing stores
  // that date — `estimated_delivery` still describes the original shipment. So a
  // reschedule here would move the wrong date and report success.
  if (order.replacement_requested) {
    res.status(400).json({
      ok: false,
      error: "replacement_already_requested",
      message: `A replacement has already been requested for order ${orderId}, so its original delivery cannot be rescheduled.`,
    });
    return;
  }

  // Same anchor as GET /reschedule/slots, or the write would refuse the very
  // dates the slot list just offered.
  const slots = weekdaySlots(order.estimated_delivery);
  if (!newDate || !slots.includes(newDate)) {
    err(res, "invalid_date", `new_date must be one of the available slots: ${slots.join(", ")}.`, 400);
    return;
  }

  // The customer picked this date, so it outranks the seed-date refresh.
  order.estimated_delivery = newDate;
  order.date_pinned = true;
  res.status(200).json({
    ok: true,
    order_id: orderId,
    new_estimated_delivery: newDate,
    message: `Delivery rescheduled to ${newDate}.`,
  });
});
