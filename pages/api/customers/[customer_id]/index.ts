import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS, CUSTOMERS } from "../../../../lib/state";
import { err } from "../../../../lib/helpers";
import { PAYMENT_METHODS } from "../../../../lib/data";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const customerId = req.query.customer_id as string;
  const cust = CUSTOMERS[customerId];
  if (!cust) {
    err(res, "customer_not_found", `No customer found with ID '${customerId}'.`, 404);
    return;
  }

  const payment = PAYMENT_METHODS[customerId];
  const orderIds = Object.values(ORDERS)
    .filter((o) => o.customer_id === customerId)
    .map((o) => o.order_id);
  const akHi = cust.state === "AK" || cust.state === "HI";

  res.status(200).json({
    ok: true,
    customer_id: cust.customer_id,
    name: cust.name,
    email: cust.email,
    phone: cust.phone ?? null,
    account_created: cust.account_created,
    marketing_opt_in: cust.marketing_opt_in,
    state: cust.state,
    address: cust.address ?? null,
    orders: orderIds,
    ak_hi_customer: akHi,
    account_status: "active",
    payment_method: payment
      ? {
          type: payment.type,
          last_four: payment.last_four,
          expiry_month: payment.expiry_month,
          expiry_year: payment.expiry_year,
          is_expired: payment.is_expired,
        }
      : null,
  });
});
