import type { NextApiRequest, NextApiResponse } from "next";
import { withState, ORDERS } from "../../../../lib/state";
import { err, ownershipError, getOrderStatus, getBody } from "../../../../lib/helpers";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const orderId = req.query.order_id as string;
  const order = ORDERS[orderId];
  if (!order) {
    err(res, "order_not_found", `No order found with ID '${orderId}'.`, 404);
    return;
  }

  const body = getBody(req);
  const customerId = body.customer_id as string | undefined;
  if (!customerId) {
    err(res, "missing_field", "Required field 'customer_id' is missing.", 400);
    return;
  }
  if (ownershipError(res, customerId, order.customer_id)) return;

  const requiredKeys = ["street", "city", "state", "pincode"];
  if (!requiredKeys.every((k) => k in body)) {
    err(res, "missing_field", "Request must include: street, city, state, pincode.", 400);
    return;
  }

  const newAddress = {
    street: body.street as string,
    city: body.city as string,
    state: body.state as string,
    pincode: body.pincode as string,
  };

  const status = getOrderStatus(order);
  if (status !== "processing") {
    res.status(400).json({
      ok: false,
      error: "address_update_not_allowed",
      message: `Address can only be updated when the order is in processing status (current: ${status}).`,
    });
    return;
  }

  order.delivery_address = newAddress;
  res.status(200).json({
    ok: true,
    order_id: orderId,
    street: newAddress.street,
    city: newAddress.city,
    state: newAddress.state,
    pincode: newAddress.pincode,
    message: "Delivery address updated successfully.",
  });
});
