import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS } from "../../../../lib/state";
import { err, getBody } from "../../../../lib/helpers";

/**
 * Updates the customer's own contact details: name, email and/or phone.
 * Partial — only the fields present in the body change, matching the admin
 * flags.ts convention.
 *
 * Deliberately does NOT touch the address. There are two addresses in this
 * system — the customer's profile address and each order's `delivery_address`
 * snapshot — and letting one endpoint write the first while
 * /orders/{id}/address writes the second was a standing invitation to change
 * the wrong one. Only orders have an address worth editing during a support
 * conversation; the profile address is read-only, via GET /customers/{id}.
 */
/**
 * One @, no whitespace, and a dot-something after it. Deliberately not an
 * RFC 5322 matcher — the point is to reject "priya", "priya@" and
 * "priya @gmail.com", not to adjudicate exotic-but-legal addresses.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Digits and nothing else. Kept a string rather than a JSON number: a phone
 * number is an identifier, not a quantity — leading zeros are significant and
 * arithmetic on it is meaningless.
 */
const PHONE_RE = /^\d+$/;

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

  if (!hasName && !hasEmail && !hasPhone) {
    err(res, "missing_field", "Provide at least one of 'name', 'email', or 'phone'.", 400);
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
    if (!EMAIL_RE.test(body.email.trim())) {
      err(
        res,
        "invalid_field",
        "'email' must be a valid address, e.g. 'priya@example.com'.",
        400
      );
      return;
    }
  }
  if (hasPhone) {
    if (typeof body.phone !== "string" || !body.phone.trim()) {
      err(res, "invalid_field", "'phone' must be a non-empty string.", 400);
      return;
    }
    // Digits only — no '+', spaces, dashes or brackets. One number written four
    // ways is four values that never compare equal, so the punctuation is
    // rejected rather than stripped: silently rewriting what the caller sent
    // would hide the fact that its format was wrong.
    if (!PHONE_RE.test(body.phone.trim())) {
      err(
        res,
        "invalid_field",
        "'phone' must contain digits only, with no '+', spaces or dashes — e.g. '919810012345'.",
        400
      );
      return;
    }
  }

  if (hasName) cust.name = body.name as string;
  if (hasEmail) cust.email = body.email as string;
  if (hasPhone) cust.phone = body.phone as string;

  res.status(200).json({
    ok: true,
    customer_id: cust.customer_id,
    name: cust.name,
    email: cust.email,
    phone: cust.phone,
    message: "Profile updated successfully.",
  });
});
