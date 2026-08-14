import type { NextApiRequest, NextApiResponse } from "next";
import { withState, mutableReplacement } from "../../../../../lib/state";
import { err, getBody, dateOnly, today } from "../../../../../lib/helpers";
import { REPLACEMENT_STATUSES } from "../../../../../lib/data";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const replacementId = req.query.replacement_id as string;
  const rep = mutableReplacement(replacementId);
  if (!rep) {
    err(res, "replacement_not_found", `No replacement found with ID '${replacementId}'.`, 404);
    return;
  }

  const body = getBody(req);
  const status = body.status as string | undefined;
  if (status === undefined) {
    err(res, "missing_field", "Provide 'status'.", 400);
    return;
  }
  if (!REPLACEMENT_STATUSES.includes(status as never)) {
    err(res, "invalid_status", `status must be one of: ${REPLACEMENT_STATUSES.join(", ")}.`, 400);
    return;
  }

  rep.status = status;
  if ((status === "replacement_dispatched" || status === "completed") && !rep.dispatched_date) {
    rep.dispatched_date = dateOnly(today());
  }
  if ((status === "replacement_delivered" || status === "completed") && !rep.delivered_date) {
    rep.delivered_date = dateOnly(today());
  }
  if (status === "replacement_requested") {
    rep.dispatched_date = null;
    rep.delivered_date = null;
  }

  res.status(200).json({
    ok: true,
    replacement_id: replacementId,
    status: rep.status,
    dispatched_date: rep.dispatched_date,
    delivered_date: rep.delivered_date,
  });
});
