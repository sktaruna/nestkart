import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS } from "../../../../../lib/state";
import { err, getBody, buildAdminOrderResponse } from "../../../../../lib/helpers";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sets the two order fields that steer return eligibility but had no admin
 * control: `damage_claim_active` (free return shipping, and eligibility ahead of
 * the window) and `estimated_delivery` (the start of the 30-day return window).
 *
 * damage_claim_active has no panel control — it is API-only, set by filing a
 * 'damaged on arrival' return and cleared when that return closes.
 *
 * estimated_delivery matters most: seed orders are built relative to `now`, so
 * the "return window expired" branch of returnEligibilityCheck could not be
 * reached at all without backdating a delivery by more than 30 days.
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
  const damageClaim = body.damage_claim_active;
  const hasDelivery = "estimated_delivery" in body;
  const estimatedDelivery = body.estimated_delivery;

  if (damageClaim === undefined && !hasDelivery) {
    err(
      res,
      "missing_field",
      "Provide at least one of 'damage_claim_active' or 'estimated_delivery'.",
      400
    );
    return;
  }

  if (damageClaim !== undefined) {
    if (typeof damageClaim !== "boolean") {
      err(res, "invalid_field", "'damage_claim_active' must be a boolean.", 400);
      return;
    }
    order.damage_claim_active = damageClaim;
  }

  if (hasDelivery) {
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
  }

  res.status(200).json({ ok: true, order: buildAdminOrderResponse(order) });
});
