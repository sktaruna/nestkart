import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, CUSTOMERS } from "../../../../lib/state";
import { err, buildOrderResponse, returnIdsForOrder } from "../../../../lib/helpers";

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

  // Newest first, then by id descending. Without the tie-break, two orders placed
  // at the same instant came back in whatever order Object.values produced, which
  // read as a jumbled list — seeded orders share timestamps easily, since they are
  // all built from the same `now`.
  const orders = Object.values(ORDERS)
    .filter((o) => o.customer_id === customerId)
    .sort((a, b) => {
      const byDate = new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
      return byDate !== 0 ? byDate : b.order_id.localeCompare(a.order_id);
    });

  // Every return across every order above, in the same order the orders are
  // listed. The per-order `return_id` is a flat joined string, so this is the
  // list form — and it is recomputed here on each request, like the per-order
  // value, so filing or deleting a return shows up on the next call.
  const returnIds = orders.flatMap((o) => returnIdsForOrder(o.order_id));

  res.status(200).json({
    ok: true,
    customer_id: customerId,
    total_orders: orders.length,
    order_ids: orders.map((o) => o.order_id),
    return_ids: returnIds,
    orders: orders.map(buildOrderResponse),
  });
});
