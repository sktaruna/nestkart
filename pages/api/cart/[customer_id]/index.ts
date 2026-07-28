import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS } from "../../../../lib/state";
import { err } from "../../../../lib/helpers";
import { buildCartResponse } from "../../../../lib/cart";

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

  res.status(200).json(buildCartResponse(customerId));
});
