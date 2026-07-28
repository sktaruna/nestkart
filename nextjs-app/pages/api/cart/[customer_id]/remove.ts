import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS, CARTS } from "../../../../lib/state";
import { err, getBody } from "../../../../lib/helpers";
import { buildCartResponse } from "../../../../lib/cart";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const customerId = req.query.customer_id as string;
  if (!(customerId in CUSTOMERS)) {
    err(res, "customer_not_found", `No customer found with ID '${customerId}'.`, 404);
    return;
  }

  const body = getBody(req);
  const productId = body.product_id as string | undefined;
  if (!productId) {
    err(res, "missing_field", "Required field 'product_id' is missing.", 400);
    return;
  }

  CARTS[customerId] = (CARTS[customerId] || []).filter((i) => i.product_id !== productId);

  res.status(200).json(buildCartResponse(customerId));
});
