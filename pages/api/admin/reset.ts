import type { NextApiRequest, NextApiResponse } from "next";
import { withState, adminReset } from "../../../lib/state";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  adminReset();

  res.status(200).json({ ok: true, message: "Demo reset complete. All seed orders refreshed." });
});
