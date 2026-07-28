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
  const qty = parseInt(String(body.quantity ?? 1), 10);

  if (!productId) {
    err(res, "missing_field", "Required field 'product_id' is missing.", 400);
    return;
  }
  const p = PRODUCTS[productId];
  if (!p) {
    err(res, "product_not_found", `No product found with ID '${productId}'.`, 404);
    return;
  }

  const cart = CARTS[customerId] || (CARTS[customerId] = []);
  const existing = cart.find((i) => i.product_id === productId);
  const currentCartQty = existing ? existing.qty : 0;
  const requestedTotal = currentCartQty + qty;

  if (p.stock === 0) {
    err(res, "out_of_stock", `'${p.name}' is currently out of stock.`, 400);
    return;
  }
  if (p.stock < requestedTotal) {
    err(
      res,
      "insufficient_stock",
      `Only ${p.stock} unit(s) of '${p.name}' available (you already have ${currentCartQty} in your cart).`,
      400
    );
    return;
  }

  if (existing) {
    existing.qty += qty;
    existing.line_total = existing.qty * existing.unit_price;
  } else {
    cart.push({
      product_id: productId,
      product_name: p.name,
      unit_price: p.price,
      qty,
      line_total: p.price * qty,
      image_url: p.image_url,
      category: p.category,
    });
  }

  res.status(200).json(buildCartResponse(customerId));
});
