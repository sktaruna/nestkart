import type { NextApiRequest, NextApiResponse } from "next";
import { ENABLED } from "../../lib/store";

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  // Every other endpoint refuses the wrong verb; this one answered POST with a
  // 200, so an agent that guessed POST got a success and learned nothing.
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed", message: "Use GET for this endpoint." });
    return;
  }

  // Reports which credential env vars are visible to the running function
  // (names only — never values) so a misconfigured deployment is
  // diagnosable from outside. Without this, missing vars silently degrade
  // into per-instance in-memory state that looks like data loss.
  res.status(200).json({
    ok: true,
    status: "healthy",
    service: "NestKart Mock API",
    version: "4.0.0",
    shared_state_persistence_enabled: ENABLED,
    detected_env_vars: {
      UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
      KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
      KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
    },
  });
}
