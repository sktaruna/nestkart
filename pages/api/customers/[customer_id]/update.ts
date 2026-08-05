import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS } from "../../../../lib/state";
import { err, getBody } from "../../../../lib/helpers";

/**
 * Updates the customer's own profile: name, email, phone, and/or saved
 * address. Partial — only the fields present in the body change, matching
 * the admin flags.ts convention. `address`, when provided, replaces the
 * whole nested object; all four of its sub-fields are required together,
 * the same rule /orders/{id}/address applies to a delivery address.
 *
 * This is the customer's own profile address, not any order's
 * delivery_address — those are independent snapshots taken at checkout and
 * are only editable via /orders/{id}/address. Editing here never touches an
 * existing order.
 */
export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const customerId = req.query.customer_id as string;
  const cust = CUSTOMERS[customerId];
  if (!cust) {
    err(res, "customer_not_found", `No customer found with ID '${customerId}'.`, 404);
    return;
  }

  const body = getBody(req);
  const hasName = "name" in body;
  const hasEmail = "email" in body;
  const hasPhone = "phone" in body;
  const hasAddress = "address" in body;

  if (!hasName && !hasEmail && !hasPhone && !hasAddress) {
    err(
      res,
      "missing_field",
      "Provide at least one of 'name', 'email', 'phone', or 'address'.",
      400
    );
    return;
  }

  if (hasName) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      err(res, "invalid_field", "'name' must be a non-empty string.", 400);
      return;
    }
  }
  if (hasEmail) {
    if (typeof body.email !== "string" || !body.email.trim()) {
      err(res, "invalid_field", "'email' must be a non-empty string.", 400);
      return;
    }
  }
  if (hasPhone) {
    if (typeof body.phone !== "string" || !body.phone.trim()) {
      err(res, "invalid_field", "'phone' must be a non-empty string.", 400);
      return;
    }
  }

  let newAddress: { street: string; city: string; state: string; pincode: string } | undefined;
  if (hasAddress) {
    const address = body.address as Record<string, unknown>;
    const requiredKeys = ["street", "city", "state", "pincode"] as const;
    if (
      typeof address !== "object" ||
      address === null ||
      !requiredKeys.every((k) => typeof address[k] === "string" && (address[k] as string).trim())
    ) {
      err(
        res,
        "invalid_field",
        "'address' must include non-empty street, city, state, and pincode.",
        400
      );
      return;
    }
    newAddress = {
      street: address.street as string,
      city: address.city as string,
      state: address.state as string,
      pincode: address.pincode as string,
    };
  }

  if (hasName) cust.name = body.name as string;
  if (hasEmail) cust.email = body.email as string;
  if (hasPhone) cust.phone = body.phone as string;
  if (newAddress) cust.address = newAddress;

  res.status(200).json({
    ok: true,
    customer_id: cust.customer_id,
    name: cust.name,
    email: cust.email,
    phone: cust.phone,
    address: cust.address,
    message: "Profile updated successfully.",
  });
});
