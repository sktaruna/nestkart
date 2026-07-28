import type { NextApiRequest, NextApiResponse } from "next";
import { withState, PRODUCTS } from "../../../../lib/state";
import { err, deriveStockStatus } from "../../../../lib/helpers";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const productId = req.query.product_id as string;
  const p = PRODUCTS[productId];
  if (!p) {
    err(res, "product_not_found", `No product found with ID '${productId}'.`, 404);
    return;
  }

  res.status(200).json({ ok: true, ...p, stock_status: deriveStockStatus(p.stock) });
});
