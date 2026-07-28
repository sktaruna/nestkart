import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS } from "../../../../lib/state";
import { err, buildOrderResponse } from "../../../../lib/helpers";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  const orderId = req.query.order_id as string;

  if (req.method === "GET") {
    const order = ORDERS[orderId];
    if (!order) {
      err(res, "order_not_found", `No order found with ID '${orderId}'.`, 404);
      return;
    }
    res.status(200).json(buildOrderResponse(order));
    return;
  }

  res.status(405).json({ ok: false, error: "method_not_allowed" });
});
