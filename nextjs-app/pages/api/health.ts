import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  res.status(200).json({
    ok: true,
    status: "healthy",
    service: "NestKart Mock API",
    version: "4.0.0",
  });
}
