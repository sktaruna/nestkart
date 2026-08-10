import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS } from "../../../../lib/state";
import { err } from "../../../../lib/helpers";
import { PAYMENT_METHODS } from "../../../../lib/data";

/**
 * Agent-only: the ConversationContext snapshot (identity, preferences,
 * entitlements, customAttributes) an agent seeds a session with. Not linked
 * from any customer- or admin-facing screen — nothing here is meant for a
 * human to read in the UI.
 *
 * Lives at its own [user_id] segment rather than under the shared
 * [customer_id] folder those other customer routes use — sharing it would
 * rename their param too. user_id and customer_id are the same identifier
 * here; only the label in the URL differs.
 *
 * Shaped for context-hydration consumers (e.g. Nambikk's "READ" action):
 * the 200 body IS the context, not wrapped in `ok`/`data` — success or
 * failure is read off the HTTP status alone, per that contract. identity
 * omits user_id since the caller already has it and treats it as
 * protected/non-overwritable; sending it back is pure noise.
 */
export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const userId = req.query.user_id as string;
  const cust = CUSTOMERS[userId];
  if (!cust) {
    err(res, "customer_not_found", `No customer found with ID '${userId}'.`, 404);
    return;
  }

  // Whatever's on the customer profile (GET /api/customers/{customer_id})
  // that identity/preferences/entitlements don't already carry — phone,
  // membership facts, payment method — rather than invented placeholder keys.
  const payment = PAYMENT_METHODS[userId];

  res.status(200).json({
    identity: {
      user_name: cust.name,
      user_email: cust.email,
    },
    preferences: {
      preferred_channel: cust.preferred_channel,
      language: cust.language,
      timezone: cust.timezone,
    },
    entitlements: {
      tier: cust.tier,
      features: cust.features,
      limits: cust.limits,
    },
    customAttributes: {
      phone: cust.phone ?? null,
      account_created: cust.account_created,
      marketing_opt_in: cust.marketing_opt_in,
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
    },
  });
});
