import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  // See health.ts — the spec documents GET only, and answering POST with a 200
  // teaches an agent that a wrong verb is fine here.
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed", message: "Use GET for this endpoint." });
    return;
  }

  res.status(200).json({
    ok: true,
    status: "healthy",
    service: "NestKart Mock API",
    version: "4.0.0",
  });
}
