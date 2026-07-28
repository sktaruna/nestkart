import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, CUSTOMERS } from "../../../../lib/state";
import { err, buildOrderResponse } from "../../../../lib/helpers";

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

  const orders = Object.values(ORDERS)
    .filter((o) => o.customer_id === customerId)
    .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime());

  res.status(200).json({
    ok: true,
    customer_id: customerId,
    total_orders: orders.length,
    orders: orders.map(buildOrderResponse),
  });
});
