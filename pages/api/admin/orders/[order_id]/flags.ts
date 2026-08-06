import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS } from "../../../../../lib/state";
import { err, getBody, buildAdminOrderResponse } from "../../../../../lib/helpers";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sets `estimated_delivery`, the start of the 30-day return window: seed orders
 * are built relative to `now`, so the "return window expired" branch of
 * returnEligibilityCheck cannot be reached at all without backdating a delivery
 * by more than 30 days.
 *
 * `damage_claim_active` is deliberately NOT settable here, despite steering
 * eligibility too. It is owned by the return lifecycle — set by filing a 'damaged
 * on arrival' return, cleared when that return closes or is deleted. Set directly
 * on the order there was no return behind it, so neither clearing path could ever
 * fire, and returnEligibilityCheck tests the flag *before* the 30-day window: the
 * flag became a permanent bypass that made an order returnable with free shipping
 * however long ago it was delivered.
 */
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
  const hasDelivery = "estimated_delivery" in body;
  const estimatedDelivery = body.estimated_delivery;

  if (!hasDelivery) {
    err(res, "missing_field", "Required field 'estimated_delivery' is missing.", 400);
    return;
  }

  // Pin it: a date set here is the scenario being staged (usually a backdated
  // delivery to reach the expired-window branch), so the seed-date refresh in
  // state.ts must not move it back under the caller on the next load.
  if (estimatedDelivery === null || estimatedDelivery === "") {
    order.estimated_delivery = null;
    order.date_pinned = true;
  } else if (typeof estimatedDelivery === "string" && DATE_ONLY.test(estimatedDelivery)) {
    order.estimated_delivery = estimatedDelivery;
    order.date_pinned = true;
  } else {
    err(res, "invalid_field", "'estimated_delivery' must be a YYYY-MM-DD date or null.", 400);
    return;
  }

  res.status(200).json({ ok: true, order: buildAdminOrderResponse(order) });
});
