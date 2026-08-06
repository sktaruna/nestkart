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
      .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime());
    return {
      customer_id: custId,
      name: cust.name,
      orders: orders.map(buildAdminOrderResponse),
    };
  });

  res.status(200).json({ ok: true, customers: customersOut });
});
