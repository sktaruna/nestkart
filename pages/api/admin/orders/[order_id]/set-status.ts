import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS } from "../../../../../lib/state";
import { err, getBody } from "../../../../../lib/helpers";
import type { OrderStatus } from "../../../../../lib/data";

const VALID_STATUSES: OrderStatus[] = ["processing", "dispatched", "in_transit", "delivered", "cancelled"];

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const orderId = req.query.order_id as string;
  if (!(orderId in ORDERS)) {
    err(res, "order_not_found", `No order found with ID '${orderId}'.`, 404);
    return;
  }

  const body = getBody(req);
  const status = body.status as OrderStatus | undefined;
  if (!status || !VALID_STATUSES.includes(status)) {
    err(res, "invalid_status", `status must be one of: ${VALID_STATUSES.join(", ")}.`, 400);
    return;
  }

  const order = ORDERS[orderId];
  order.status = status;
  order.cancelled = status === "cancelled";

  // A damage claim means "the item arrived damaged", which cannot be true of an
  // order that is no longer delivered. Left set, rewinding a delivered order
  // produced an incoherent record — and returnEligibilityCheck tests status
  // before the damage branch, so the stale claim was silently masked rather
  // than reported.
  let damageClaimCleared = false;
  if (status !== "delivered" && order.damage_claim_active) {
    order.damage_claim_active = false;
    damageClaimCleared = true;
  }

  res.status(200).json({
    ok: true,
    order_id: orderId,
    status,
    damage_claim_active: order.damage_claim_active,
    ...(damageClaimCleared ? { damage_claim_cleared: true } : {}),
  });
});
