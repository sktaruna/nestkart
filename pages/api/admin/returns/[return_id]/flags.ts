import type { NextApiRequest, NextApiResponse } from "next";
import { withState, mutableReturn } from "../../../../../lib/state";
import { err, getBody } from "../../../../../lib/helpers";

/**
 * Stages the edge cases that only the seeded returns used to have: a refund held
 * for review, and a return flagged for human escalation. Without this the two
 * interesting branches of GET /api/returns/:id were unreachable for any return
 * the agent created itself.
 */
export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const returnId = req.query.return_id as string;
  const ret = mutableReturn(returnId);
  if (!ret) {
    err(res, "return_not_found", `No return found with ID '${returnId}'.`, 404);
    return;
  }

  const body = getBody(req);
  const refundLocked = body.refund_locked;
  const escalation = body.requires_agent_escalation;

  if (refundLocked === undefined && escalation === undefined) {
    err(
      res,
      "missing_field",
      "Provide at least one of 'refund_locked' or 'requires_agent_escalation'.",
      400
    );
    return;
  }

  if (refundLocked !== undefined) {
    if (typeof refundLocked !== "boolean") {
      err(res, "invalid_field", "'refund_locked' must be a boolean.", 400);
      return;
    }
    ret.refund_locked = refundLocked;
    ret.refund_locked_reason = refundLocked
      ? (body.refund_locked_reason as string) || "damage_claim_under_review"
      : undefined;
  }

  if (escalation !== undefined) {
    if (typeof escalation !== "boolean") {
      err(res, "invalid_field", "'requires_agent_escalation' must be a boolean.", 400);
      return;
    }
    ret.requires_agent_escalation = escalation;
    ret.escalation_reason = escalation
      ? (body.escalation_reason as string) || "manual_review_requested"
      : undefined;
  }

  res.status(200).json({
    ok: true,
    return_id: returnId,
    refund_locked: ret.refund_locked ?? false,
    refund_locked_reason: ret.refund_locked_reason ?? null,
    requires_agent_escalation: ret.requires_agent_escalation ?? false,
    escalation_reason: ret.escalation_reason ?? null,
  });
});
