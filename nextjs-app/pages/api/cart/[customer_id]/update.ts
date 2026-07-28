import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS, CARTS, PRODUCTS } from "../../../../lib/state";
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
  const qtyRaw = body.quantity;

  if (!productId || qtyRaw === undefined || qtyRaw === null) {
    err(res, "missing_field", "Required fields: product_id, quantity.", 400);
    return;
  }
  const qty = parseInt(String(qtyRaw), 10);

  const cart = CARTS[customerId] || (CARTS[customerId] = []);

  if (qty <= 0) {
    CARTS[customerId] = cart.filter((i) => i.product_id !== productId);
  } else {
    const p = PRODUCTS[productId];
    if (p) {
      if (p.stock === 0) {
        err(res, "out_of_stock", `'${p.name}' is currently out of stock.`, 400);
        return;
      }
      if (p.stock < qty) {
        err(res, "insufficient_stock", `Only ${p.stock} unit(s) of '${p.name}' available.`, 400);
        return;
      }
    }
    const existing = cart.find((i) => i.product_id === productId);
    if (existing) {
      existing.qty = qty;
      existing.line_total = qty * existing.unit_price;
    }
  }

  res.status(200).json(buildCartResponse(customerId));
});
