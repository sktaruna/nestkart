import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, CUSTOMERS } from "../../../../lib/state";
import { buildAdminOrderResponse } from "../../../../lib/helpers";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const customersOut = Object.entries(CUSTOMERS).map(([custId, cust]) => {
    const orders = Object.values(ORDERS)
      .filter((o) => o.customer_id === custId)
      // Newest first, then by id descending — the same tie-break the customer
      // endpoint uses. Without it, orders sharing a timestamp came back in
      // Object.values order, so the admin panel and /customers/{id}/orders
      // listed the same two orders in opposite orders.
      .sort((a, b) => {
        const byDate = new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
        return byDate !== 0 ? byDate : b.order_id.localeCompare(a.order_id);
      });
    return {
      customer_id: custId,
      name: cust.name,
      orders: orders.map(buildAdminOrderResponse),
    };
  });

  res.status(200).json({ ok: true, customers: customersOut });
});
