import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, DYNAMIC_RETURNS, SEED_RETURN_IDS, findReturn, openReturnsForOrder } from "../../../../../lib/state";
import { err } from "../../../../../lib/helpers";

/**
 * Deletes a single return.
 *
 * Previously the only way to undo a return the agent had filed was admin/reset,
 * which also threw away every other piece of staged state. Seeded returns cannot
 * be deleted — they are fixtures the demo is built around — but any edit made to
 * one can be reverted, since editing promotes a copy into DYNAMIC_RETURNS.
 */
export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "DELETE") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const returnId = req.query.return_id as string;
  const ret = findReturn(returnId);
  if (!ret) {
    err(res, "return_not_found", `No return found with ID '${returnId}'.`, 404);
    return;
  }

  if (SEED_RETURN_IDS.has(returnId)) {
    // Reverting an edited seed still leaves the seed itself in place.
    if (DYNAMIC_RETURNS[returnId]) {
      delete DYNAMIC_RETURNS[returnId];
      res.status(200).json({
        ok: true,
        return_id: returnId,
        deleted: false,
        reverted: true,
        message: "Seeded return restored to its original state.",
      });
      return;
    }
    err(res, "delete_not_allowed", "Seeded demo returns cannot be deleted.", 400);
    return;
  }

  const orderId = ret.order_id;
  delete DYNAMIC_RETURNS[returnId];

  // Drop the order's damage claim once no open return justifies it, so deleting
  // the return that opened the claim doesn't leave the flag stranded.
  let damageClaimCleared = false;
  const order = ORDERS[orderId];
  if (order?.damage_claim_active) {
    const stillClaimed = openReturnsForOrder(orderId).some(
      (r) => r.reason === "damaged on arrival"
    );
    if (!stillClaimed) {
      order.damage_claim_active = false;
      damageClaimCleared = true;
    }
  }

  res.status(200).json({
    ok: true,
    return_id: returnId,
    deleted: true,
    order_id: orderId,
    ...(damageClaimCleared ? { damage_claim_cleared: true } : {}),
  });
});
