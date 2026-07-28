import type { NextApiRequest, NextApiResponse } from "next";
import { withState, PRODUCTS } from "../../../../../lib/state";
import { err, deriveStockStatus, getBody } from "../../../../../lib/helpers";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const productId = req.query.product_id as string;
  const p = PRODUCTS[productId];
  if (!p) {
    err(res, "product_not_found", `No product found with ID '${productId}'.`, 404);
    return;
  }

  const body = getBody(req);
  const stock = body.stock;
  if (stock === undefined || stock === null || !Number.isInteger(stock) || (stock as number) < 0) {
    err(res, "invalid_stock", "Field 'stock' must be a non-negative integer.", 400);
    return;
  }

  p.stock = stock as number;
  res.status(200).json({
    ok: true,
    product_id: productId,
    name: p.name,
    stock: p.stock,
    stock_status: deriveStockStatus(p.stock),
  });
});
