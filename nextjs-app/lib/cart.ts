import { CARTS, PRODUCTS } from "./state";
import { formatInr } from "./helpers";

export function buildCartResponse(customerId: string): Record<string, unknown> {
  const items = CARTS[customerId] || [];
  const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
  const hasLarge = items.some((i) => PRODUCTS[i.product_id]?.shipping_type === "large_item");
  const shippingMethod = hasLarge ? "large_item" : "standard";
  const shippingCost = hasLarge ? 499 : 0;

  return {
    ok: true,
    customer_id: customerId,
    items,
    item_count: items.reduce((sum, i) => sum + i.qty, 0),
    subtotal,
    subtotal_formatted: formatInr(subtotal),
    shipping_method: shippingMethod,
    shipping_cost: shippingCost,
    shipping_cost_formatted: shippingCost ? formatInr(shippingCost) : "Free",
    estimated_delivery_days: hasLarge ? 10 : 5,
  };
}
