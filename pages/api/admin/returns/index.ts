import type { NextApiRequest, NextApiResponse } from "next";
import { withState, allReturns, SEED_RETURN_IDS } from "../../../../lib/state";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  // The raw record plus is_seed, which the panel uses to mark which returns a
  // reset will bring back.
  const returns = allReturns().map((ret) => ({
    ...ret,
    is_seed: SEED_RETURN_IDS.has(ret.return_id),
  }));

  res.status(200).json({ ok: true, total: returns.length, returns });
});
