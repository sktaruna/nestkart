import type { NextApiRequest, NextApiResponse } from "next";
import * as requestLog from "../../lib/requestLog";

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  // Every other endpoint refuses the wrong verb; this one answered POST with a
  // 200, so an agent that guessed POST got a success and learned nothing.
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed", message: "Use GET for this endpoint." });
    return;
  }

  // State is in-process memory, so there is no external dependency to report
  // on. `request_log_enabled` is here because an empty log in the admin panel
  // is otherwise indistinguishable from an agent that made no calls.
  res.status(200).json({
    ok: true,
    status: "healthy",
    service: "NestKart Mock API",
    version: "4.0.0",
    request_log_enabled: requestLog.ENABLED,
  });
}
