// Mock seed data for NestKart API — ported 1:1 from app.py

export interface Address {
  street: string;
  city: string;
  state: string;
  pincode: string;
}

export interface Customer {
  customer_id: string;
  name: string;
  email: string;
  phone: string;
  account_created: string;
  marketing_opt_in: boolean;
  address: Address;
  // The rest power GET /api/customers/{customer_id}/context — the
  // agent-facing snapshot of who this customer is, not shown on any
  // customer- or admin-facing screen. customAttributes on that endpoint is
  // assembled from the fields above plus PAYMENT_METHODS, not stored here.
  preferred_channel: string;
  language: string;
  timezone: string;
  tier: string;
  features: string[];
  limits: Record<string, number>;
}

export interface PaymentMethod {
  type: string;
  last_four: string;
  expiry_month: string;
  expiry_year: string;
  is_expired: boolean;
}

export interface Product {
  product_id: string;
  name: string;
  category: string;
  price: number;
  original_price: number | null;
  stock: number;
  shipping_type: string;
  image_url: string;
  badge: string | null;
  description: string;
}

export interface Review {
  reviewer: string;
  rating: number;
  comment: string;
  date: string;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  image_url?: string;
  category?: string;
}

export type OrderStatus = "processing" | "dispatched" | "in_transit" | "delivered" | "cancelled";

export interface Order {
  order_id: string;
  customer_id: string;
  items: OrderItem[];
  price_total: number;
  placed_at: string; // ISO datetime string
  /**
   * Stored, never derived. Only the admin panel / set-status API moves an order
   * through the pipeline — elapsed time since `placed_at` has no effect.
   */
  status: OrderStatus;
  shipping_method: string;
  estimated_delivery: string | null;
  delivery_address: Address;
  damage_claim_active: boolean;
  cancelled: boolean;
  tracking_number: string | null;
  stock_decremented?: boolean;
  /**
   * Set when someone chooses `estimated_delivery` deliberately — an admin
   * backdating a delivery to reach the expired-window branch, or a customer
   * rescheduling. Those dates are the point of the scenario, so the seed-date
   * refresh leaves them alone. Cleared by admin/reset, which rebuilds the seeds.
   */
  date_pinned?: boolean;
  /**
   * Set once a replacement is requested. Replacements aren't a trackable
   * resource — nothing persists the REP- id anywhere — so this flag is the only
   * memory of the request, and it exists solely to block a return being filed
   * on the same order afterward (and vice versa, via openReturnsForOrder in
   * replacement.ts). It never clears: there is no "replacement closed" event to
   * clear it on.
   */
  replacement_requested?: boolean;
}

export interface ReturnRecord {
  return_id: string;
  order_id: string;
  customer_id: string;
  item_name: string;
  reason: string;
  status: string;
  return_initiated: string;
  return_received_date: string | null;
  refund_status: string;
  refund_amount: string | null;
  refund_includes_shipping: boolean;
  refund_estimated_date: string | null;
  refund_issued_date: string | null;
  refund_method: string;
  return_shipping: string;
  condition?: string;
  has_original_packaging?: boolean;
}

/** The return lifecycle the admin panel can move a return through. */
export const RETURN_STATUSES = [
  "return_requested",
  "return_in_transit",
  "return_received",
  "under_review",
  "completed",
  "rejected",
] as const;

/** Refund progress, tracked independently of the return's physical journey. */
export const REFUND_STATUSES = ["pending", "processing", "issued", "rejected"] as const;

/**
 * A persisted replacement request. Mirrors ReturnRecord in shape/lifecycle so
 * "where's my replacement?" has the same answer shape as "where's my refund?".
 * Previously fire-and-forget (see the comment on Order.replacement_requested) —
 * this is what that endpoint should have been writing to all along.
 */
export interface ReplacementRecord {
  replacement_id: string;
  order_id: string;
  customer_id: string;
  item_name: string;
  reason: string;
  status: string;
  requested_at: string;
  estimated_dispatch_date: string | null;
  dispatched_date: string | null;
  delivered_date: string | null;
  tracking_number: string | null;
}

/** The replacement lifecycle the admin panel can move a replacement through. */
export const REPLACEMENT_STATUSES = [
  "replacement_requested",
  "replacement_dispatched",
  "replacement_delivered",
  "completed",
] as const;

/**
 * A fresh copy every call, same as seedProducts() — customer records are now
 * mutable (see the profile-update endpoint) and persisted, so state.ts needs
 * an unmutated original to fall back to on admin/reset.
 */
export function seedCustomers(): Record<string, Customer> {
  return {
  cust_001: {
    customer_id: "cust_001",
    name: "Priya Sharma",
    email: "taruna2004126@gmail.com",
    phone: "919810012345",
    account_created: "2024-03-10",
    marketing_opt_in: true,
    address: {
      street: "14, Lodhi Colony",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110003",
    },
    preferred_channel: "email",
    language: "en",
    timezone: "Asia/Kolkata",
    tier: "premium",
    features: ["priority_support"],
    limits: { monthly_requests: 5000 },
  },
  cust_002: {
    customer_id: "cust_002",
    name: "Arjun Mehta",
    email: "11182tarunask@gmail.com",
    phone: "919022067890",
    account_created: "2023-11-22",
    marketing_opt_in: false,
    address: {
      street: "42, Bandra West, Linking Road",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400050",
    },
    preferred_channel: "phone",
    language: "en",
    timezone: "Asia/Kolkata",
    tier: "standard",
    features: [],
    limits: { monthly_requests: 1000 },
  },
  cust_003: {
    customer_id: "cust_003",
    name: "Kavitha Nair",
    email: "tarunask.1806@gmail.com",
    phone: "919443055678",
    account_created: "2025-01-05",
    marketing_opt_in: true,
    address: {
      street: "8, Indiranagar, 100 Feet Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560038",
    },
    preferred_channel: "slack",
    language: "en",
    timezone: "Asia/Kolkata",
    tier: "premium",
    features: ["priority_support", "early_access"],
    limits: { monthly_requests: 5000 },
  },
  cust_004: {
    customer_id: "cust_004",
    name: "Rohit Verma",
    email: "taruna.stockmarket@gmail.com",
    phone: "919876543210",
    account_created: "2024-08-19",
    marketing_opt_in: false,
    address: {
      street: "22, Sector 17, Chandigarh",
      city: "Chandigarh",
      state: "Punjab",
      pincode: "160017",
    },
    preferred_channel: "email",
    language: "en",
    timezone: "Asia/Kolkata",
    tier: "free",
    features: [],
    limits: { monthly_requests: 250 },
  },
  cust_005: {
    customer_id: "cust_005",
    name: "Anika Rossi",
    email: "taruna2210569@ssn.edu.in",
    phone: "919100088888",
    account_created: "2024-12-01",
    marketing_opt_in: true,
    address: {
      street: "5, Alipore Road",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700027",
    },
    preferred_channel: "email",
    language: "en",
    timezone: "Asia/Kolkata",
    tier: "standard",
    features: [],
    limits: { monthly_requests: 1000 },
  },
  };
}

export const PAYMENT_METHODS: Record<string, PaymentMethod> = {
  cust_001: { type: "Visa", last_four: "4242", expiry_month: "09", expiry_year: "2027", is_expired: false },
  cust_002: { type: "Mastercard", last_four: "5555", expiry_month: "03", expiry_year: "2026", is_expired: false },
  cust_003: { type: "Amex", last_four: "0005", expiry_month: "11", expiry_year: "2025", is_expired: false },
  cust_004: { type: "Visa", last_four: "1234", expiry_month: "07", expiry_year: "2026", is_expired: false },
  cust_005: { type: "Mastercard", last_four: "8888", expiry_month: "01", expiry_year: "2024", is_expired: true },
};

export function seedProducts(): Record<string, Product> {
  return {
    prod_001: {
      product_id: "prod_001", name: "Linen Cloud Sofa", category: "living", price: 89999,
      original_price: null, stock: 8, shipping_type: "large_item",
      image_url: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=700&q=80",
      badge: null,
      description: "A generously cushioned sofa in breathable natural linen — made for long afternoons.",
    },
    prod_002: {
      product_id: "prod_002", name: "Velvet Accent Chair", category: "living", price: 32500,
      original_price: null, stock: 5, shipping_type: "large_item",
      image_url: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=700&q=80",
      badge: null,
      description: "A striking accent chair in rich velvet with solid walnut legs — a statement piece that earns its place.",
    },
    prod_003: {
      product_id: "prod_003", name: "Teak Slab Dining Table", category: "dining", price: 124000,
      original_price: null, stock: 3, shipping_type: "large_item",
      image_url: "https://images.unsplash.com/photo-1617806118233-18e1de247200?w=700&q=80",
      badge: null,
      description: "Solid teak slab with live-edge detailing — each table is unique, built to last a lifetime.",
    },
    prod_004: {
      product_id: "prod_004", name: "Cloud Linen Bed Set", category: "bedroom", price: 14500,
      original_price: null, stock: 12, shipping_type: "standard",
      image_url: "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=700&q=80",
      badge: null,
      description: "Stone-washed linen bedding that gets softer with every wash — your bed will never feel the same.",
    },
    prod_005: {
      product_id: "prod_005", name: "Rattan Lounge Chair", category: "living", price: 21500,
      original_price: 28000, stock: 2, shipping_type: "large_item",
      image_url: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=700&q=80",
      badge: "Sale",
      description: "Handwoven rattan with a deep seat cushion — perfect for a sunny corner or reading nook.",
    },
    prod_006: {
      product_id: "prod_006", name: "Walnut Platform Bed", category: "bedroom", price: 68000,
      original_price: null, stock: 4, shipping_type: "large_item",
      image_url: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=700&q=80",
      badge: null,
      description: "A low-profile platform bed in solid walnut — clean lines, quiet elegance, no box spring needed.",
    },
    prod_007: {
      product_id: "prod_007", name: "Jute Woven Floor Lamp", category: "lighting", price: 18500,
      original_price: null, stock: 7, shipping_type: "standard",
      image_url: "https://images.pexels.com/photos/29559655/pexels-photo-29559655.jpeg?auto=compress&cs=tinysrgb&w=700",
      badge: null,
      description: "A tall floor lamp with a hand-wrapped jute shade that casts the warmest evening glow.",
    },
    prod_008: {
      product_id: "prod_008", name: "Ceramic Vessel Set", category: "decor", price: 4200,
      original_price: null, stock: 15, shipping_type: "standard",
      image_url: "https://images.pexels.com/photos/4611612/pexels-photo-4611612.jpeg?auto=compress&cs=tinysrgb&w=700",
      badge: null,
      description: "A trio of wheel-thrown ceramic vessels in matte sand — beautiful empty, even better with dried stems.",
    },
    prod_009: {
      product_id: "prod_009", name: "Linen Dining Chair Set of 2", category: "dining", price: 22000,
      original_price: null, stock: 6, shipping_type: "large_item",
      image_url: "https://images.pexels.com/photos/6312360/pexels-photo-6312360.jpeg?auto=compress&cs=tinysrgb&w=700",
      badge: null,
      description: "Paired dining chairs in natural linen with oak frames — understated, refined, built for gathering.",
    },
    prod_010: {
      product_id: "prod_010", name: "Washi Paper Pendant", category: "lighting", price: 8800,
      original_price: null, stock: 9, shipping_type: "standard",
      image_url: "https://images.pexels.com/photos/698907/pexels-photo-698907.jpeg?auto=compress&cs=tinysrgb&w=700",
      badge: "New",
      description: "A Japanese washi paper pendant that diffuses light beautifully — lightweight, sculptural, serene.",
    },
    prod_011: {
      product_id: "prod_011", name: "Handwoven Wool Rug 6×9 ft", category: "living", price: 26500,
      original_price: null, stock: 3, shipping_type: "standard",
      image_url: "https://images.pexels.com/photos/12199846/pexels-photo-12199846.jpeg?auto=compress&cs=tinysrgb&w=700",
      badge: "New",
      description: "Handwoven by artisans in Rajasthan — dense wool pile in warm, earthy tones that anchor any room.",
    },
    prod_012: {
      // 19, not 20 — one unit is reserved by ORD-10104 (stock_decremented),
      // so cancelling that order is the live "inventory restores to 20" demo.
      product_id: "prod_012", name: "Terracotta Planter Trio", category: "decor", price: 3600,
      original_price: null, stock: 19, shipping_type: "standard",
      image_url: "https://images.pexels.com/photos/9707245/pexels-photo-9707245.jpeg?auto=compress&cs=tinysrgb&w=700",
      badge: null,
      description: "Three hand-thrown terracotta planters in graduated sizes — classic, breathable, effortlessly pretty.",
    },
    prod_013: {
      product_id: "prod_013", name: "Sheesham Wood Bookshelf", category: "living", price: 34500,
      original_price: null, stock: 0, shipping_type: "large_item",
      image_url: "https://images.pexels.com/photos/2883049/pexels-photo-2883049.jpeg?auto=compress&cs=tinysrgb&w=700",
      badge: null,
      description: "A solid sheesham bookshelf with open shelving and a lower cabinet — sturdy, honest, beautiful.",
    },
    prod_014: {
      product_id: "prod_014", name: "Brass Table Lamp", category: "lighting", price: 12800,
      original_price: null, stock: 1, shipping_type: "standard",
      image_url: "https://images.pexels.com/photos/4577650/pexels-photo-4577650.jpeg?auto=compress&cs=tinysrgb&w=700",
      badge: null,
      description: "A slender brass table lamp with a linen drum shade — warm, timeless, and endlessly versatile.",
    },
    prod_015: {
      // 7, not 8 — same reservation as prod_012 above, from ORD-10104.
      product_id: "prod_015", name: "Mango Wood Side Table", category: "living", price: 9800,
      original_price: null, stock: 7, shipping_type: "standard",
      image_url: "https://images.pexels.com/photos/11112739/pexels-photo-11112739.jpeg?auto=compress&cs=tinysrgb&w=700",
      badge: "New",
      description: "A compact round side table in solid mango wood with a natural finish — the perfect companion piece.",
    },
  };
}

export const PRODUCT_REVIEWS: Record<string, Review[]> = {
  prod_001: [
    { reviewer: "Meera K.", rating: 5, comment: "Absolutely stunning sofa — the linen is so soft and the cushions are heavenly.", date: "2025-04-12" },
    { reviewer: "Ananya S.", rating: 4, comment: "Great quality and delivery was prompt. Slight colour difference from photos but still beautiful.", date: "2025-03-28" },
    { reviewer: "Priyanka R.", rating: 5, comment: "Worth every rupee. This sofa has transformed our living room.", date: "2025-05-02" },
    { reviewer: "Rahul M.", rating: 4, comment: "Comfortable and well-made. Assembly was straightforward.", date: "2025-05-15" },
  ],
  prod_002: [
    { reviewer: "Divya N.", rating: 5, comment: "The velvet is so rich and the walnut legs are gorgeous. Perfect statement chair.", date: "2025-04-18" },
    { reviewer: "Siddharth P.", rating: 3, comment: "Good chair but the velvet picks up pet hair easily. Still very stylish.", date: "2025-03-10" },
    { reviewer: "Lakshmi T.", rating: 5, comment: "Love this chair. It is exactly as described and looks stunning in my study.", date: "2025-05-20" },
  ],
  prod_003: [
    { reviewer: "Vikram A.", rating: 5, comment: "The live-edge detail is breathtaking. A true centrepiece for our dining room.", date: "2025-02-14" },
    { reviewer: "Sunita B.", rating: 4, comment: "Incredibly solid table. Delivery team handled it with care. Would buy again.", date: "2025-03-05" },
    { reviewer: "Amit C.", rating: 5, comment: "Six of us sat around it comfortably. Quality is exceptional.", date: "2025-04-01" },
  ],
  prod_004: [
    { reviewer: "Pooja G.", rating: 5, comment: "The softest bedding I have ever slept in. Gets better with every wash.", date: "2025-05-10" },
    { reviewer: "Neha H.", rating: 4, comment: "Beautiful linen, very breathable. Delivery was quick.", date: "2025-04-22" },
    { reviewer: "Riya J.", rating: 5, comment: "Exactly what our bedroom needed. Timeless and luxurious.", date: "2025-03-30" },
    { reviewer: "Aishwarya L.", rating: 4, comment: "Lovely quality. True linen feel. Happy with the purchase.", date: "2025-02-28" },
  ],
  prod_005: [
    { reviewer: "Karan M.", rating: 5, comment: "The rattan work is impeccable. Looks even better in person.", date: "2025-05-01" },
    { reviewer: "Smita N.", rating: 4, comment: "Very comfortable. The sale price was incredible value.", date: "2025-04-14" },
    { reviewer: "Tanvi O.", rating: 3, comment: "Nice chair but cushion could be thicker. Still a good buy.", date: "2025-03-20" },
  ],
  prod_006: [
    { reviewer: "Varun P.", rating: 5, comment: "The walnut grain is stunning. Exactly the low-profile look we wanted.", date: "2025-04-08" },
    { reviewer: "Shilpa Q.", rating: 5, comment: "Perfect bed frame. Rock solid and incredibly beautiful.", date: "2025-05-03" },
    { reviewer: "Deepak R.", rating: 4, comment: "Great quality. Delivery was a bit delayed but worth the wait.", date: "2025-03-15" },
  ],
  prod_007: [
    { reviewer: "Ishaan S.", rating: 5, comment: "The warmest, most atmospheric light. Our living room feels like a retreat now.", date: "2025-04-25" },
    { reviewer: "Pallavi T.", rating: 4, comment: "Beautiful lamp. The jute shade is even nicer in person.", date: "2025-03-18" },
    { reviewer: "Manish U.", rating: 5, comment: "Perfect for my reading corner. The light quality is wonderful.", date: "2025-05-08" },
  ],
  prod_008: [
    { reviewer: "Gayatri V.", rating: 5, comment: "These vessels are so beautiful. I have them on every shelf.", date: "2025-05-12" },
    { reviewer: "Suresh W.", rating: 4, comment: "Lovely ceramics. Great quality for the price.", date: "2025-04-30" },
    { reviewer: "Asha X.", rating: 5, comment: "Gorgeous set. Used them as vases and they look stunning.", date: "2025-03-22" },
  ],
  prod_009: [
    { reviewer: "Rohini Y.", rating: 4, comment: "Very well made chairs. The linen is high quality and the oak frames are solid.", date: "2025-04-20" },
    { reviewer: "Naveen Z.", rating: 5, comment: "These pair beautifully with our dining table. Very elegant.", date: "2025-05-05" },
    { reviewer: "Chitra A.", rating: 4, comment: "Good chairs. Comfortable for long dinners.", date: "2025-03-28" },
  ],
  prod_010: [
    { reviewer: "Arun B.", rating: 5, comment: "Magical light quality. The washi paper creates the most beautiful glow.", date: "2025-05-18" },
    { reviewer: "Saranya C.", rating: 5, comment: "So elegant. Exactly what I was looking for above my dining table.", date: "2025-04-10" },
    { reviewer: "Vijay D.", rating: 4, comment: "Beautiful pendant. Lightweight and easy to install.", date: "2025-03-14" },
  ],
  prod_011: [
    { reviewer: "Meena E.", rating: 5, comment: "The craftsmanship on this rug is extraordinary. Worth every rupee.", date: "2025-04-16" },
    { reviewer: "Rajan F.", rating: 4, comment: "Lovely colours and very plush underfoot. Anchors the room perfectly.", date: "2025-05-06" },
    { reviewer: "Usha G.", rating: 5, comment: "Bought as a gift — the recipient was overjoyed. Beautiful workmanship.", date: "2025-03-25" },
  ],
  prod_012: [
    { reviewer: "Harish H.", rating: 5, comment: "These planters are perfect. Classic terracotta that works with everything.", date: "2025-05-14" },
    { reviewer: "Kamala I.", rating: 4, comment: "Nice quality. My plants seem happier in these than in plastic pots.", date: "2025-04-28" },
    { reviewer: "Ravi J.", rating: 5, comment: "Beautiful set. Exactly what our balcony needed.", date: "2025-03-10" },
  ],
  prod_013: [
    { reviewer: "Geeta K.", rating: 5, comment: "Stunning bookshelf. The sheesham grain is so rich and warm.", date: "2025-02-20" },
    { reviewer: "Mohan L.", rating: 4, comment: "Very solid and well finished. Easy to assemble.", date: "2025-03-08" },
    { reviewer: "Padma M.", rating: 4, comment: "Love it. Wish it had one more shelf but overall excellent.", date: "2025-04-05" },
  ],
  prod_014: [
    { reviewer: "Sanjay N.", rating: 5, comment: "The brass finish is perfect. Adds such warmth to our bedroom.", date: "2025-05-07" },
    { reviewer: "Hema O.", rating: 4, comment: "Elegant lamp. The linen shade is a perfect match.", date: "2025-04-23" },
    { reviewer: "Kritika P.", rating: 5, comment: "Exactly as pictured. The light it casts is so cosy.", date: "2025-03-17" },
  ],
  prod_015: [
    { reviewer: "Sunil Q.", rating: 5, comment: "Perfect little side table. The mango wood has such a lovely grain.", date: "2025-05-19" },
    { reviewer: "Rekha R.", rating: 4, comment: "Great quality for the price. Sturdy and looks beautiful.", date: "2025-04-27" },
    { reviewer: "Nitin S.", rating: 5, comment: "Love the natural finish. It goes with everything in our living room.", date: "2025-03-31" },
  ],
};

/**
 * The seeded returns, dated relative to `now` like the orders they belong to.
 *
 * These carried fixed 2025 dates while buildSeedOrders() computed everything
 * from `now`, so the gap widened by a day every day: a return ended up reading
 * as initiated more than a year *before* the order it was filed against was
 * placed. Both returns hang off orders delivered two days ago, so both are
 * initiated on or after that.
 *
 * One return per customer, and both are open — cust_001 has RET-2202 on
 * ORD-10103, cust_002 has RET-2204 on ORD-10201. So `returnable` is false on
 * exactly those two orders and true on every other delivered, in-window one.
 */
export function seedReturns(now: Date): Record<string, ReturnRecord> {
  return {
    "RET-2202": {
      return_id: "RET-2202", order_id: "ORD-10103", customer_id: "cust_001",
      item_name: "Ceramic Vessel Set",
      reason: "change of mind", status: "return_requested",
      // Still only requested, so no received date and no refund date to quote.
      return_initiated: addDaysDateOnly(now, -1),
      return_received_date: null,
      refund_status: "pending", refund_amount: null,
      refund_includes_shipping: false, refund_estimated_date: null,
      refund_issued_date: null, refund_method: "original_payment_method",
      return_shipping: "₹200 estimated",
    },
    "RET-2204": {
      return_id: "RET-2204", order_id: "ORD-10201", customer_id: "cust_002",
      item_name: "Rattan Lounge Chair",
      reason: "wrong item received", status: "return_in_transit",
      return_initiated: addDaysDateOnly(now, -1),
      return_received_date: null,
      refund_status: "pending", refund_amount: "₹21,500",
      refund_includes_shipping: true,
      refund_estimated_date: addDaysDateOnly(now, 6),
      refund_issued_date: null, refund_method: "original_payment_method",
      return_shipping: "free",
    },
  };
}

/**
 * Seeded replacement requests, same relative-dating approach as seedReturns().
 * See ReplacementRecord — persisted so "where's my replacement?" has an answer,
 * unlike the fire-and-forget REP- id the live endpoint used to hand back.
 */
export function seedReplacements(now: Date): Record<string, ReplacementRecord> {
  return {
    "REP-3001": {
      replacement_id: "REP-3001", order_id: "ORD-10302", customer_id: "cust_003",
      item_name: "Walnut Platform Bed",
      reason: "damaged on arrival",
      status: "replacement_dispatched",
      requested_at: addDaysDateOnly(now, -1),
      estimated_dispatch_date: addDaysDateOnly(now, 0),
      dispatched_date: addDaysDateOnly(now, 0),
      delivered_date: null,
      tracking_number: "NKREP3001TRACK",
    },
    "REP-3002": {
      replacement_id: "REP-3002", order_id: "ORD-10403", customer_id: "cust_004",
      item_name: "Sheesham Wood Bookshelf",
      reason: "damaged on arrival",
      status: "completed",
      requested_at: addDaysDateOnly(now, -12),
      estimated_dispatch_date: addDaysDateOnly(now, -7),
      dispatched_date: addDaysDateOnly(now, -7),
      delivered_date: addDaysDateOnly(now, -3),
      tracking_number: "NKREP3002TRACK",
    },
  };
}

function daysAgoIso(now: Date, days: number, hours = 0, minutes = 0): string {
  const d = new Date(now.getTime() - (days * 24 * 60 + hours * 60 + minutes) * 60 * 1000);
  return d.toISOString();
}

/**
 * YYYY-MM-DD in local time. Not `toISOString()` — that would shift seeded
 * delivery dates back a day in any timezone ahead of UTC, so a "delivered
 * today" seed order would read as delivered yesterday. Mirrors
 * `dateOnly` in helpers.ts; duplicated here because helpers.ts imports
 * from this module.
 */
function dateOnlyIso(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function addDaysDateOnly(now: Date, days: number): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return dateOnlyIso(d);
}

/** Builds the seed orders exactly as Flask's _seed_orders() does, relative to `now`. */
export function buildSeedOrders(now: Date): Record<string, Order> {
  // The pristine seed address, not whatever the customer has edited it to —
  // rebuilding seed orders (admin/reset) should not retroactively change an
  // already-placed order's delivery_address just because the profile moved.
  const pristineCustomers = seedCustomers();
  const addr = (custId: string): Address => ({ ...pristineCustomers[custId].address });

  /**
   * Delivery date for the delivered seed orders: two days ago, i.e. after they
   * were placed (5 days ago) and before today.
   *
   * Was `(now - 5 days) + 10 days`, which is `now + 5 days` — so every delivered
   * order claimed a delivery date five days in the FUTURE. The account page
   * rendered "Delivered: <date 5 days out>", and returnEligibilityCheck measures
   * the 30-day window from this field, so a delivered order reported 35 days
   * remaining on a 30-day window and an expiry 5 days later than the truth.
   */
  const deliveredDaysAgo = (): string =>
    dateOnlyIso(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));

  const seeded: Record<string, Order> = {
    "ORD-10101": {
      // Delivered further back than the other cust_001 seeds. Carries no
      // return of its own, so it is a plain in-window delivered order.
      order_id: "ORD-10101", customer_id: "cust_001",
      items: [{ product_id: "prod_014", product_name: "Brass Table Lamp", qty: 1, unit_price: 12800, line_total: 12800 }],
      price_total: 12800,
      placed_at: daysAgoIso(now, 12),
      status: "delivered",
      shipping_method: "standard",
      estimated_delivery: addDaysDateOnly(now, -7),
      delivery_address: addr("cust_001"),
      damage_claim_active: false, cancelled: false, tracking_number: "NK10101TRACK",
    },
    "ORD-10102": {
      order_id: "ORD-10102", customer_id: "cust_001",
      items: [{ product_id: "prod_001", product_name: "Linen Cloud Sofa", qty: 1, unit_price: 89999, line_total: 89999 }],
      price_total: 89999,
      placed_at: daysAgoIso(now, 5),
      status: "delivered",
      shipping_method: "large_item",
      estimated_delivery: deliveredDaysAgo(),
      delivery_address: addr("cust_001"),
      damage_claim_active: false, cancelled: false, tracking_number: "NK10102TRACK",
    },
    "ORD-10103": {
      order_id: "ORD-10103", customer_id: "cust_001",
      items: [{ product_id: "prod_008", product_name: "Ceramic Vessel Set", qty: 2, unit_price: 4200, line_total: 8400 }],
      price_total: 8400,
      // Four days rather than five, so this does not land on the same instant as
      // ORD-10102 — identical timestamps left the newest-first sort with nothing
      // to order them by, and the customer's list came back 10103, 10101, 10102.
      //
      // Delivered, because RET-2202 hangs off this order and a return is only
      // valid after confirmed delivery (returnEligibilityCheck rejects
      // processing/dispatched/in_transit). Dated like the other delivered seeds
      // so "delivered" doesn't sit on an order placed a day and a half ago.
      placed_at: daysAgoIso(now, 4),
      status: "delivered",
      shipping_method: "standard",
      estimated_delivery: deliveredDaysAgo(),
      delivery_address: addr("cust_001"),
      damage_claim_active: false, cancelled: false, tracking_number: "NK10103TRACK",
    },
    "ORD-10104": {
      order_id: "ORD-10104", customer_id: "cust_001",
      items: [
        { product_id: "prod_012", product_name: "Terracotta Planter Trio", qty: 1, unit_price: 3600, line_total: 3600 },
        { product_id: "prod_015", product_name: "Mango Wood Side Table", qty: 1, unit_price: 9800, line_total: 9800 },
      ],
      price_total: 13400,
      placed_at: daysAgoIso(now, 0, 0, 5),
      status: "processing",
      shipping_method: "standard",
      estimated_delivery: addDaysDateOnly(now, 5),
      delivery_address: addr("cust_001"),
      damage_claim_active: false, cancelled: false, tracking_number: null,
      // Stock for both items was decremented at "checkout" — see prod_012/
      // prod_015 above — so cancelling this order is the live, visible
      // inventory-restoration demo (19 → 20 and 7 → 8 in Admin → Inventory).
      stock_decremented: true,
    },
    "ORD-10201": {
      // Hosts RET-2204 (return_in_transit) — cust_002's one open return, kept
      // off ORD-10202 so that order stays a clean returnable one.
      order_id: "ORD-10201", customer_id: "cust_002",
      items: [{ product_id: "prod_005", product_name: "Rattan Lounge Chair", qty: 1, unit_price: 21500, line_total: 21500 }],
      price_total: 21500,
      placed_at: daysAgoIso(now, 6),
      status: "delivered",
      shipping_method: "large_item",
      estimated_delivery: addDaysDateOnly(now, -1),
      delivery_address: addr("cust_002"),
      damage_claim_active: false, cancelled: false, tracking_number: "NK10201TRACK",
    },
    "ORD-10202": {
      order_id: "ORD-10202", customer_id: "cust_002",
      items: [{ product_id: "prod_003", product_name: "Teak Slab Dining Table", qty: 1, unit_price: 124000, line_total: 124000 }],
      price_total: 124000,
      placed_at: daysAgoIso(now, 5),
      status: "delivered",
      shipping_method: "large_item",
      estimated_delivery: deliveredDaysAgo(),
      delivery_address: addr("cust_002"),
      damage_claim_active: false, cancelled: false, tracking_number: "NK10202TRACK",
    },
    "ORD-10203": {
      order_id: "ORD-10203", customer_id: "cust_002",
      items: [{ product_id: "prod_009", product_name: "Linen Dining Chair Set of 2", qty: 1, unit_price: 22000, line_total: 22000 }],
      price_total: 22000,
      placed_at: daysAgoIso(now, 1, 12),
      status: "dispatched",
      shipping_method: "large_item",
      estimated_delivery: addDaysDateOnly(now, 10),
      delivery_address: addr("cust_002"),
      damage_claim_active: false, cancelled: false, tracking_number: null,
    },
    "ORD-10204": {
      order_id: "ORD-10204", customer_id: "cust_002",
      items: [{ product_id: "prod_011", product_name: "Handwoven Wool Rug 6×9 ft", qty: 1, unit_price: 26500, line_total: 26500 }],
      price_total: 26500,
      placed_at: daysAgoIso(now, 0, 0, 5),
      status: "processing",
      shipping_method: "standard",
      estimated_delivery: addDaysDateOnly(now, 5),
      delivery_address: addr("cust_002"),
      damage_claim_active: false, cancelled: false, tracking_number: null,
    },
    "ORD-10301": {
      // Damage reported, no replacement filed yet — the LIVE "request a
      // replacement" demo order (ORD-10302 already has one dispatched, so a
      // live request there would fail with replacement_already_requested).
      order_id: "ORD-10301", customer_id: "cust_003",
      items: [{ product_id: "prod_009", product_name: "Linen Dining Chair Set of 2", qty: 1, unit_price: 22000, line_total: 22000 }],
      price_total: 22000,
      placed_at: daysAgoIso(now, 6),
      status: "delivered",
      shipping_method: "large_item",
      estimated_delivery: addDaysDateOnly(now, -4),
      delivery_address: addr("cust_003"),
      damage_claim_active: true, cancelled: false, tracking_number: "NK10301TRACK",
    },
    "ORD-10302": {
      // Damage reported on arrival (no return filed — see REP-3001): this is
      // the "damaged item, replacement in progress" demo order.
      order_id: "ORD-10302", customer_id: "cust_003",
      items: [{ product_id: "prod_006", product_name: "Walnut Platform Bed", qty: 1, unit_price: 68000, line_total: 68000 }],
      price_total: 68000,
      placed_at: daysAgoIso(now, 5),
      status: "delivered",
      shipping_method: "large_item",
      estimated_delivery: deliveredDaysAgo(),
      delivery_address: addr("cust_003"),
      damage_claim_active: true, cancelled: false, tracking_number: "NK10302TRACK",
      replacement_requested: true,
    },
    "ORD-10303": {
      order_id: "ORD-10303", customer_id: "cust_003",
      items: [{ product_id: "prod_004", product_name: "Cloud Linen Bed Set", qty: 2, unit_price: 14500, line_total: 29000 }],
      price_total: 29000,
      placed_at: daysAgoIso(now, 1, 12),
      status: "dispatched",
      shipping_method: "standard",
      estimated_delivery: addDaysDateOnly(now, 5),
      delivery_address: addr("cust_003"),
      damage_claim_active: false, cancelled: false, tracking_number: null,
    },
    "ORD-10401": {
      // Return/replacement window explicitly expired (delivered 35 days ago,
      // no damage claim) — the negative demo for "can you return/replace
      // this?" once the 30-day window has lapsed. date_pinned so admin/reset
      // doesn't re-anchor it back inside the window.
      order_id: "ORD-10401", customer_id: "cust_004",
      items: [{ product_id: "prod_015", product_name: "Mango Wood Side Table", qty: 1, unit_price: 9800, line_total: 9800 }],
      price_total: 9800,
      placed_at: daysAgoIso(now, 40),
      status: "delivered",
      shipping_method: "standard",
      estimated_delivery: addDaysDateOnly(now, -35),
      delivery_address: addr("cust_004"),
      damage_claim_active: false, cancelled: false, tracking_number: "NK10401TRACK",
      date_pinned: true,
    },
    "ORD-10402": {
      // Damage claim active AND window expired — the negative demo showing a
      // damage claim alone doesn't keep an order replaceable forever.
      order_id: "ORD-10402", customer_id: "cust_004",
      items: [{ product_id: "prod_014", product_name: "Brass Table Lamp", qty: 1, unit_price: 12800, line_total: 12800 }],
      price_total: 12800,
      placed_at: daysAgoIso(now, 40),
      status: "delivered",
      shipping_method: "standard",
      estimated_delivery: addDaysDateOnly(now, -35),
      delivery_address: addr("cust_004"),
      damage_claim_active: true, cancelled: false, tracking_number: "NK10402TRACK",
      date_pinned: true,
    },
    "ORD-10403": {
      // Damage claim already resolved via replacement (REP-3002) — the
      // historical/closed damage-claim demo.
      order_id: "ORD-10403", customer_id: "cust_004",
      items: [{ product_id: "prod_013", product_name: "Sheesham Wood Bookshelf", qty: 1, unit_price: 34500, line_total: 34500 }],
      price_total: 34500,
      placed_at: daysAgoIso(now, 15),
      status: "delivered",
      shipping_method: "large_item",
      estimated_delivery: addDaysDateOnly(now, -10),
      delivery_address: addr("cust_004"),
      damage_claim_active: true, cancelled: false, tracking_number: "NK10403TRACK",
      replacement_requested: true,
    },
    "ORD-10404": {
      order_id: "ORD-10404", customer_id: "cust_004",
      items: [{ product_id: "prod_002", product_name: "Velvet Accent Chair", qty: 1, unit_price: 32500, line_total: 32500 }],
      price_total: 32500,
      placed_at: daysAgoIso(now, 5),
      status: "delivered",
      shipping_method: "large_item",
      estimated_delivery: deliveredDaysAgo(),
      delivery_address: addr("cust_004"),
      damage_claim_active: false, cancelled: false, tracking_number: "NK10404TRACK",
    },
    "ORD-10405": {
      order_id: "ORD-10405", customer_id: "cust_004",
      items: [
        { product_id: "prod_007", product_name: "Jute Woven Floor Lamp", qty: 1, unit_price: 18500, line_total: 18500 },
        { product_id: "prod_010", product_name: "Washi Paper Pendant", qty: 1, unit_price: 8800, line_total: 8800 },
      ],
      price_total: 27300,
      placed_at: daysAgoIso(now, 0, 0, 5),
      status: "processing",
      shipping_method: "standard",
      estimated_delivery: addDaysDateOnly(now, 5),
      delivery_address: addr("cust_004"),
      damage_claim_active: false, cancelled: false, tracking_number: null,
    },
    // cust_005 (Anika Rossi) has no orders — deliberately. Their customer record
    // and expired payment method remain, so the panel still has a customer whose
    // order history is empty.
  };

  return seeded;
}
