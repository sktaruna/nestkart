import type { NextApiRequest, NextApiResponse } from "next";
import { withState, allReturns, SEED_RETURN_IDS } from "../../../../lib/state";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  // Unlike the public GET /api/returns/:id, this returns the raw record with
  // every flag present (not omitted when false) so the admin panel can render
  // and toggle them without guessing at absent keys.
  const returns = allReturns().map((ret) => ({
    ...ret,
    refund_locked: ret.refund_locked ?? false,
    refund_locked_reason: ret.refund_locked_reason ?? null,
    requires_agent_escalation: ret.requires_agent_escalation ?? false,
    escalation_reason: ret.escalation_reason ?? null,
    is_seed: SEED_RETURN_IDS.has(ret.return_id),
  }));

  res.status(200).json({ ok: true, total: returns.length, returns });
});
