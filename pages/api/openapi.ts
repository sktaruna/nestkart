import type { NextApiRequest, NextApiResponse } from "next";
import { buildSpec } from "../../lib/openapi";

/**
 * Serves the API contract so an AI agent platform can import it and derive tool
 * definitions, instead of having each endpoint transcribed by hand.
 *
 * Deliberately not wrapped in withState: it touches no demo state, so it needs
 * neither a Redis round-trip nor the write lock.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  // Build the server URL from the request. x-forwarded-proto is what actually
  // reflects the client's scheme behind Vercel's proxy — req.socket always looks
  // like plain HTTP there, which would emit an http:// server URL for an
  // https-only deployment and get the spec rejected as mixed content.
  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0];
  const proto = forwardedProto || "http";
  const host = req.headers.host || "localhost:3000";

  res.setHeader("Cache-Control", "public, max-age=300");
  // Agent platforms fetch this from their own origin when importing.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json(buildSpec(`${proto}://${host}`));
}
