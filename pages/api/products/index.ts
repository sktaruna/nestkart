import type { NextApiRequest, NextApiResponse } from "next";
import { withState, PRODUCTS } from "../../../lib/state";
import { deriveStockStatus } from "../../../lib/helpers";
import type { Product } from "../../../lib/data";

export default withState(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const category = (req.query.category as string | undefined) ?? undefined;
  const sort = (req.query.sort as string | undefined) ?? undefined;
  const search = ((req.query.search as string | undefined) ?? "").toLowerCase();

  let products: Product[] = Object.values(PRODUCTS);

  if (category && category !== "all") {
    products = products.filter((p) => p.category === category);
  }
  if (search) {
    products = products.filter((p) => p.name.toLowerCase().includes(search));
  }

  if (sort === "price_asc") {
    products = [...products].sort((a, b) => a.price - b.price);
  } else if (sort === "price_desc") {
    products = [...products].sort((a, b) => b.price - a.price);
  } else if (sort === "newest") {
    // Use badge "New" first, then by product_id descending... matches Python's
    // ascending sort with (0 if New else 1, product_id) key — stable sort.
    products = [...products].sort((a, b) => {
      const aKey = a.badge === "New" ? 0 : 1;
      const bKey = b.badge === "New" ? 0 : 1;
      if (aKey !== bKey) return aKey - bKey;
      return a.product_id < b.product_id ? -1 : a.product_id > b.product_id ? 1 : 0;
    });
  }

  const result = products.map((p) => ({
    ...p,
    stock_status: deriveStockStatus(p.stock),
  }));

  res.status(200).json({ ok: true, count: result.length, products: result });
});
