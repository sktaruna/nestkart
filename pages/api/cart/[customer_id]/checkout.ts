import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS, CARTS, PRODUCTS, ORDERS, orderCounter } from "../../../../lib/state";
import { err, formatInr } from "../../../../lib/helpers";

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

  const cartItems = CARTS[customerId] || [];
  if (cartItems.length === 0) {
    err(res, "empty_cart", "Cannot checkout with an empty cart.", 400);
    return;
  }

  // Validate stock for every item before touching anything
  for (const item of cartItems) {
    const p = PRODUCTS[item.product_id];
    if (p) {
      if (p.stock === 0) {
        err(res, "out_of_stock", `'${p.name}' is out of stock. Please remove it from your cart before checking out.`, 400);
        return;
      }
      if (p.stock < item.qty) {
        err(res, "insufficient_stock", `Only ${p.stock} unit(s) of '${p.name}' available, but ${item.qty} requested.`, 400);
        return;
      }
    }
  }

  const hasLarge = cartItems.some((i) => PRODUCTS[i.product_id]?.shipping_type === "large_item");
  const shippingMethod = hasLarge ? "large_item" : "standard";
  const deliveryDays = hasLarge ? 10 : 5;
  const estimatedDelivery = new Date(Date.now() + deliveryDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const priceTotal = cartItems.reduce((sum, i) => sum + i.line_total, 0);

  const orderId = `ORD-${orderCounter.value}`;
  orderCounter.value += 1;

  ORDERS[orderId] = {
    order_id: orderId,
    customer_id: customerId,
    items: cartItems.map((i) => ({ ...i })),
    price_total: priceTotal,
    placed_at: new Date().toISOString(),
    status: "processing",
    shipping_method: shippingMethod,
    estimated_delivery: estimatedDelivery,
    delivery_address: { ...CUSTOMERS[customerId].address },
    damage_claim_active: false,
    cancelled: false,
    tracking_number: null,
    stock_decremented: true, // flag so cancel/return know to restore
  };

  // Decrement stock now that the order is confirmed
  for (const item of cartItems) {
    const p = PRODUCTS[item.product_id];
    if (p) p.stock = Math.max(0, p.stock - item.qty);
  }

  CARTS[customerId] = [];

  res.status(200).json({
    ok: true,
    order_id: orderId,
    price_total: priceTotal,
    price_total_formatted: formatInr(priceTotal),
    estimated_delivery: estimatedDelivery,
    shipping_method: shippingMethod,
    status: "processing",
  });
});
