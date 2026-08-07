import type { NextApiRequest, NextApiResponse } from "next";
import { withState, CUSTOMERS } from "../../../../lib/state";
import { err } from "../../../../lib/helpers";

/**
 * Agent-only: the ConversationContext snapshot (identity, preferences,
 * entitlements, customAttributes) an agent seeds a session with. Not linked
 * from any customer- or admin-facing screen — nothing here is meant for a
 * human to read in the UI.
 */
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

  res.status(200).json({
    ok: true,
    identity: {
      user_id: cust.customer_id,
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
    customAttributes: cust.customAttributes,
  });
});
