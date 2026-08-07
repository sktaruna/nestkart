import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, CUSTOMERS } from "../../../../lib/state";
import { OrderStatus } from "../../../../lib/data";
import { err, buildOrderResponse, returnIdsForOrder, getOrderStatus, orderActions } from "../../../../lib/helpers";

const ORDER_STATUSES: OrderStatus[] = [
  "processing",
  "dispatched",
  "in_transit",
  "delivered",
  "cancelled",
];

// Same booleans orderActions() puts on each order in the response — queryable
// so an agent can ask "which of these can still be cancelled?" directly
// instead of fetching everything and filtering client-side.
const ACTION_FLAGS = ["cancellable", "reschedulable", "returnable", "replaceable"] as const;
type ActionFlag = (typeof ACTION_FLAGS)[number];

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

  // An unrecognised status is rejected rather than ignored: silently returning
  // the unfiltered history would read as "no orders match that", which is a
  // plausible-looking wrong answer for a caller that cannot see the query.
  const status = req.query.status as string | undefined;
  if (status !== undefined && !ORDER_STATUSES.includes(status as OrderStatus)) {
    err(
      res,
      "invalid_status",
      `'${status}' is not a valid order status. Expected one of: ${ORDER_STATUSES.join(", ")}.`,
      400
    );
    return;
  }

  // Each flag is its own strict boolean param — "true"/"false" only, 400 on
  // anything else — rather than one combined param, so they compose freely
  // with each other and with status (?returnable=true&status=delivered).
  const flagFilters: Partial<Record<ActionFlag, boolean>> = {};
  for (const flag of ACTION_FLAGS) {
    const raw = req.query[flag] as string | undefined;
    if (raw === undefined) continue;
    if (raw !== "true" && raw !== "false") {
      err(res, `invalid_${flag}`, `'${raw}' is not a valid value for '${flag}'. Expected 'true' or 'false'.`, 400);
      return;
    }
    flagFilters[flag] = raw === "true";
  }

  // Newest first, then by id descending. Without the tie-break, two orders placed
  // at the same instant came back in whatever order Object.values produced, which
  // read as a jumbled list — seeded orders share timestamps easily, since they are
  // all built from the same `now`.
  const orders = Object.values(ORDERS)
    .filter((o) => o.customer_id === customerId)
    // getOrderStatus, not o.status — a cancelled order carries its own flag and
    // keeps whatever status it had when it was cancelled.
    .filter((o) => !status || getOrderStatus(o) === status)
    .filter((o) => {
      if (Object.keys(flagFilters).length === 0) return true;
      const actions = orderActions(o);
      return ACTION_FLAGS.every((flag) => flagFilters[flag] === undefined || actions[flag] === flagFilters[flag]);
    })
    .sort((a, b) => {
      const byDate = new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
      return byDate !== 0 ? byDate : b.order_id.localeCompare(a.order_id);
    });

  // Every return across every order above, in the same order the orders are
  // listed. The per-order `return_id` is a flat joined string, so this is the
  // list form — and it is recomputed here on each request, like the per-order
  // value, so filing or deleting a return shows up on the next call.
  const returnIds = orders.flatMap((o) => returnIdsForOrder(o.order_id));

  res.status(200).json({
    ok: true,
    customer_id: customerId,
    total_orders: orders.length,
    order_ids: orders.map((o) => o.order_id),
    return_ids: returnIds,
    orders: orders.map(buildOrderResponse),
  });
});
