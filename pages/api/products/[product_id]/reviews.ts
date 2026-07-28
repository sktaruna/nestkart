import type { NextApiRequest, NextApiResponse } from "next";
import { withState, PRODUCTS } from "../../../../lib/state";
import { err } from "../../../../lib/helpers";
import { PRODUCT_REVIEWS } from "../../../../lib/data";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const productId = req.query.product_id as string;
  if (!(productId in PRODUCTS)) {
    err(res, "product_not_found", `No product found with ID '${productId}'.`, 404);
    return;
  }

  const reviews = PRODUCT_REVIEWS[productId] || [];
  if (reviews.length === 0) {
    res.status(200).json({ ok: true, product_id: productId, average_rating: null, review_count: 0, reviews: [] });
    return;
  }

  const avg = Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10;
  const recent = [...reviews].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 3);

  res.status(200).json({
    ok: true,
    product_id: productId,
    average_rating: avg,
    review_count: reviews.length,
    reviews: recent,
  });
});
