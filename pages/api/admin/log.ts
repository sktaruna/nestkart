import type { NextApiRequest, NextApiResponse } from "next";
import * as requestLog from "../../../lib/requestLog";

/**
 * Reads (GET) or clears (DELETE) the API request log.
 *
 * Deliberately not wrapped in withState: it touches no demo state, and being
 * outside the wrapper is what keeps it from logging itself, which would fill the
 * log with the act of reading the log.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  if (req.method === "DELETE") {
    requestLog.clear();
    res.status(200).json({ ok: true, cleared: true });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const limitRaw = parseInt(String(req.query.limit ?? ""), 10);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, requestLog.MAX_ENTRIES)
      : requestLog.MAX_ENTRIES;

  const entries = requestLog.read(limit);

  res.status(200).json({
    ok: true,
    // Surfaced so the admin panel can say "logging is off" rather than showing an
    // empty table that looks like the agent made no calls.
    enabled: requestLog.ENABLED,
    max_entries: requestLog.MAX_ENTRIES,
    count: entries.length,
    entries,
  });
}
