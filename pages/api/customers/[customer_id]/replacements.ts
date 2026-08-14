import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS, allReplacements } from "../../../../lib/state";
import { err } from "../../../../lib/helpers";

/**
 * Demo/admin infrastructure, not a distinct Agent capability — the 10 official
 * capabilities are unchanged (Request Replacement covers filing one; there is
 * no separate "Replacement Status Lookup"). This exists so the replacement
 * records this demo persists (see ReplacementRecord in lib/data.ts) are
 * inspectable the same way returns are, for admin visibility and debugging.
 */
export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const customerId = req.query.customer_id as string;
  if (!(customerId in CUSTOMERS)) {
    err(res, "customer_not_found", `No customer found with ID '${customerId}'.`, 404);
    return;
  }

  const replacements = allReplacements()
    .filter((rep) => rep.customer_id === customerId)
    .map((rep) => ({
      replacement_id: rep.replacement_id,
      order_id: rep.order_id,
      item_name: rep.item_name,
      reason: rep.reason.replace(/_/g, " "),
      status: rep.status,
      requested_at: rep.requested_at,
      estimated_dispatch_date: rep.estimated_dispatch_date,
      dispatched_date: rep.dispatched_date,
      delivered_date: rep.delivered_date,
      tracking_number: rep.tracking_number,
    }));

  res.status(200).json({
    ok: true,
    customer_id: customerId,
    total_replacements: replacements.length,
    replacement_ids: replacements.map((r) => r.replacement_id),
    replacements,
  });
});
