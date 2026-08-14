import type { NextApiRequest, NextApiResponse } from "next";
import { withState, allReplacements, SEED_REPLACEMENT_IDS } from "../../../../lib/state";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const replacements = allReplacements().map((rep) => ({
    ...rep,
    is_seed: SEED_REPLACEMENT_IDS.has(rep.replacement_id),
  }));

  res.status(200).json({ ok: true, total: replacements.length, replacements });
});
