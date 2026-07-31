/**
 * OpenAPI 3.0 description of the NestKart mock API.
 *
 * This is the contract an AI support agent (Intercom Fin and similar) is pointed
 * at to derive its tool definitions. It is hand-maintained: nothing generates it
 * from the route files, so a new or changed endpoint under pages/api must be
 * reflected here too or the agent will keep calling the old shape.
 *
 * Two conventions matter more than anything else here, and both are spelled out
 * in the top-level `description` because an agent reading only the schemas would
 * get them wrong:
 *
 *  1. Every response carries a boolean `ok`. It is the authoritative
 *     success signal — NOT the HTTP status.
 *  2. Several business refusals return HTTP 200 with `ok: false`. A cancel on a
 *     dispatched order and a return on an ineligible order both "succeed" at the
 *     HTTP level while declining the action. An agent that branches on the
 *     status code alone will report these to the customer as done.
 */

const DESCRIPTION = `Mock e-commerce backend for NestKart, a furniture and home-goods retailer.
Used to exercise AI support agents against realistic order, return, and refund flows.

## Reading responses

Always branch on the \`ok\` field, never on the HTTP status.

- \`ok: true\` — the action was performed.
- \`ok: false\` with HTTP 4xx — the request was malformed or the resource is missing.
- \`ok: false\` with **HTTP 200** — the request was valid but the action was
  *declined for business reasons*. This applies to \`POST /orders/{id}/cancel\`
  (order past processing, or a return already in flight) and
  \`POST /orders/{id}/returns\` (order not eligible).
  Treat these as failures and relay the \`reason\` field to the customer.

Errors carry a machine-readable \`error\` code and a human-readable \`message\`
suitable for paraphrasing to a customer.

Any write can return **503 \`state_unavailable\`** if the backing store could not
be read. Nothing was changed — the call is safe to retry, and must be retried
rather than assumed to have applied.

## Authentication

None. No API key, token, or session is required on any endpoint.

## Ownership checks

Every customer-initiated write on an order requires \`customer_id\` in the body and
returns \`403 ownership_mismatch\` if it does not match the order's owner. Verify
the customer's identity before calling; the API will not do it for you.

## Order status

\`processing\` -> \`dispatched\` -> \`in_transit\` -> \`delivered\`, or \`cancelled\`.
Status is stored, never inferred from elapsed time — it only advances when staff
move it. What each status permits:

| Action | Allowed when status is |
| --- | --- |
| Cancel | \`processing\` only |
| Change address | \`processing\` only |
| Reschedule delivery | \`processing\` or \`dispatched\` |
| Return / replacement | \`delivered\` only, within 30 days of \`estimated_delivery\` |
| Tracking number present | \`dispatched\`, \`in_transit\`, \`delivered\` |

## Money and dates

Prices are integer rupees (\`89999\`); \`*_formatted\` fields carry the display
string (\`"₹89,999"\`). Dates are \`YYYY-MM-DD\`; \`placed_at\` is ISO 8601 datetime.

## Admin endpoints

Everything under \`/api/admin\` is demo tooling for staging test scenarios, not
customer-facing. An AI support agent should not be given these as tools.`;

const OK_TRUE = { type: "boolean", enum: [true], description: "Always true on success." };

/** The standard error envelope, reused by every non-200 response. */
const ERROR_SCHEMA = {
  type: "object",
  required: ["ok", "error", "message"],
  properties: {
    ok: { type: "boolean", enum: [false] },
    error: { type: "string", description: "Machine-readable error code.", example: "order_not_found" },
    message: {
      type: "string",
      description: "Human-readable explanation, safe to paraphrase to a customer.",
      example: "No order found with ID 'ORD-99999'.",
    },
  },
};

const ADDRESS_SCHEMA = {
  type: "object",
  properties: {
    street: { type: "string", example: "12 Rosewood Lane, Bandra West" },
    city: { type: "string", example: "Mumbai" },
    state: { type: "string", example: "MH" },
    pincode: { type: "string", example: "400050" },
  },
};

const ORDER_ITEM_SCHEMA = {
  type: "object",
  properties: {
    product_id: { type: "string", example: "prod_001" },
    product_name: { type: "string", example: "Linen Cloud Sofa" },
    qty: { type: "integer", example: 1 },
    unit_price: { type: "integer", description: "Rupees.", example: 89999 },
    line_total: { type: "integer", description: "unit_price x qty, in rupees.", example: 89999 },
  },
};

/** Shape returned by buildOrderResponse — GET /orders/{id} and both admin order lists. */
const ORDER_SCHEMA = {
  type: "object",
  properties: {
    ok: OK_TRUE,
    order_id: { type: "string", example: "ORD-10101" },
    customer_id: { type: "string", example: "cust_001" },
    items: { type: "array", items: ORDER_ITEM_SCHEMA },
    price_total: { type: "integer", description: "Rupees.", example: 89999 },
    price_total_formatted: { type: "string", example: "₹89,999" },
    placed_at: { type: "string", format: "date-time" },
    status: {
      type: "string",
      enum: ["processing", "dispatched", "in_transit", "delivered", "cancelled"],
    },
    shipping_method: { type: "string", enum: ["standard", "large_item"] },
    estimated_delivery: {
      type: "string", nullable: true,
      format: "date",
      description: "Delivery date. Also the start of the 30-day return window.",
    },
    delivery_address: ADDRESS_SCHEMA,
    damage_claim_active: {
      type: "boolean",
      description:
        "An item was reported damaged on arrival. Makes the order return-eligible regardless of the 30-day window, with free return shipping, but holds the refund under review.",
    },
    cancellable: {
      type: "boolean",
      description: "True only while status is 'processing'. Check before offering to cancel.",
    },
    tracking_number: {
      type: "string", nullable: true,
      description: "Null until the order is dispatched.",
      example: "NK10101TRACK",
    },
    tracking_url: { type: "string", nullable: true, example: "https://track.nestkart.com/NK10101TRACK" },
    is_seed: {
      type: "boolean",
      description: "Demo fixture order (cannot be deleted) rather than one created through checkout.",
    },
  },
};

const PRODUCT_SCHEMA = {
  type: "object",
  properties: {
    product_id: { type: "string", example: "prod_001" },
    name: { type: "string", example: "Linen Cloud Sofa" },
    category: {
      type: "string",
      enum: ["living", "dining", "bedroom", "lighting", "decor"],
    },
    price: { type: "integer", description: "Current price in rupees.", example: 89999 },
    original_price: {
      type: "integer", nullable: true,
      description: "Pre-discount price when on sale, otherwise null.",
    },
    stock: { type: "integer", description: "Units available.", example: 7 },
    stock_status: {
      type: "string",
      enum: ["in_stock", "low_stock", "out_of_stock"],
      description: "Derived from stock: 0 = out_of_stock, 1-3 = low_stock, else in_stock.",
    },
    shipping_type: {
      type: "string",
      enum: ["standard", "large_item"],
      description: "large_item adds ₹499 shipping and extends delivery to 10 days.",
    },
    image_url: { type: "string" },
    badge: { type: "string", nullable: true, example: "New" },
    description: { type: "string" },
  },
};

const CART_SCHEMA = {
  type: "object",
  properties: {
    ok: OK_TRUE,
    customer_id: { type: "string", example: "cust_001" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          product_name: { type: "string" },
          unit_price: { type: "integer" },
          qty: { type: "integer" },
          line_total: { type: "integer" },
          image_url: { type: "string" },
          category: { type: "string" },
        },
      },
    },
    item_count: { type: "integer", description: "Sum of quantities, not distinct lines." },
    subtotal: { type: "integer", description: "Rupees, excluding shipping." },
    subtotal_formatted: { type: "string", example: "₹89,999" },
    shipping_method: { type: "string", enum: ["standard", "large_item"] },
    shipping_cost: { type: "integer", description: "₹499 if any item is large_item, else 0." },
    shipping_cost_formatted: { type: "string", example: "Free" },
    estimated_delivery_days: { type: "integer", enum: [5, 10] },
  },
};

const RETURN_SCHEMA = {
  type: "object",
  properties: {
    ok: OK_TRUE,
    return_id: { type: "string", example: "RET-2201" },
    order_id: { type: "string", example: "ORD-10101" },
    customer_id: {
      type: "string",
      example: "cust_001",
      description:
        "Owner of the return. Sent by GET /api/returns/{return_id}; omitted from the per-customer list, where the customer is already the path parameter.",
    },
    item_name: { type: "string", example: "Linen Cloud Sofa" },
    reason: { type: "string", example: "item not as described" },
    status: {
      type: "string",
      enum: [
        "return_requested",
        "return_in_transit",
        "return_received",
        "under_review",
        "completed",
        "rejected",
      ],
      description: "Where the physical item is in the return journey.",
    },
    return_initiated: { type: "string", format: "date" },
    return_received_date: {
      type: "string", nullable: true,
      format: "date",
      description: "Null until the warehouse receives the item.",
    },
    refund_status: {
      type: "string",
      enum: ["pending", "processing", "issued", "rejected"],
      description: "Refund progress, tracked separately from the return's physical status.",
    },
    refund_amount: {
      type: "string",
      nullable: true,
      example: "₹89,999",
      description:
        "The order total, formatted. Null only on seeded returns that were created without one — every return filed through the API carries an amount.",
    },
    refund_includes_shipping: { type: "boolean", nullable: true },
    refund_method: { type: "string", example: "original_payment_method" },
    refund_estimated_date: { type: "string", nullable: true, format: "date" },
    refund_issued_date: {
      type: "string", nullable: true,
      format: "date",
      description: "Set only once refund_status is 'issued'.",
    },
    refund_locked: {
      type: "boolean",
      description:
        "PRESENT ONLY WHEN TRUE. The refund is held and will not progress until review completes — do not promise the customer a date. See refund_locked_reason.",
    },
    refund_locked_reason: {
      type: "string",
      enum: ["damage_claim_under_review", "non_returnable_item", "manual_review_requested"],
      description: "Present only alongside refund_locked.",
    },
    requires_agent_escalation: {
      type: "boolean",
      description:
        "PRESENT ONLY WHEN TRUE. This case needs a human. Hand off rather than attempting to resolve it.",
    },
    escalation_reason: {
      type: "string",
      example: "refund_overdue",
      description: "Present only alongside requires_agent_escalation.",
    },
  },
};

const CUSTOMER_ID_PARAM = {
  name: "customer_id",
  in: "path",
  required: true,
  schema: { type: "string" },
  example: "cust_001",
};

const ORDER_ID_PARAM = {
  name: "order_id",
  in: "path",
  required: true,
  schema: { type: "string" },
  example: "ORD-10101",
};

const PRODUCT_ID_PARAM = {
  name: "product_id",
  in: "path",
  required: true,
  schema: { type: "string" },
  example: "prod_001",
};

const RETURN_ID_PARAM = {
  name: "return_id",
  in: "path",
  required: true,
  schema: { type: "string" },
  example: "RET-2201",
};

/** 200 response with an inline schema. */
const ok200 = (description: string, schema: unknown) => ({
  200: { description, content: { "application/json": { schema } } },
});

/** Error response entry. `codes` are the `error` values this status can carry. */
const errRes = (status: number, description: string, codes: string[]) => ({
  [status]: {
    description: `${description} (\`error\`: ${codes.map((c) => `\`${c}\``).join(", ")})`,
    content: { "application/json": { schema: ERROR_SCHEMA } },
  },
});

const NOT_ALLOWED = errRes(405, "Wrong HTTP method for this path.", ["method_not_allowed"]);

const jsonBody = (schema: unknown) => ({
  required: true,
  content: { "application/json": { schema } },
});

export const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "NestKart Mock API",
    version: "4.1.0",
    description: DESCRIPTION,
  },
  // Placeholder. The /api/openapi route replaces this with the host it was
  // requested through, so the spec works unchanged on localhost and on a
  // deployment without either being hardcoded here.
  servers: [{ url: "/", description: "Same origin as this document." }],
  // Explicitly no authentication, rather than merely unstated — an empty
  // requirement list is how OpenAPI says "this API takes no credentials".
  security: [],
  tags: [
    { name: "Catalog", description: "Products and reviews. Public, no customer context." },
    { name: "Customer", description: "Account details, order history, returns history." },
    { name: "Cart", description: "Cart contents and checkout." },
    { name: "Orders", description: "Order lookup and customer-initiated changes." },
    { name: "Returns", description: "Return and refund status." },
    {
      name: "Admin",
      description: "Demo scenario staging. Do NOT expose these to a support agent.",
    },
    { name: "Meta", description: "Health checks and this specification." },
  ],
  paths: {
    // ── Meta ────────────────────────────────────────────────────────────────
    "/api/health": {
      get: {
        tags: ["Meta"],
        summary: "Health check with persistence diagnostics",
        description:
          "Reports whether shared-state persistence is configured. `shared_state_persistence_enabled: false` means state is per-instance and will appear to reset between requests in a deployed environment.",
        responses: {
          ...ok200("Service is up.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              status: { type: "string", example: "healthy" },
              service: { type: "string" },
              version: { type: "string" },
              shared_state_persistence_enabled: { type: "boolean" },
              detected_env_vars: {
                type: "object",
                description: "Which credential variables are visible. Names only, never values.",
                additionalProperties: { type: "boolean" },
              },
            },
          }),
        },
      },
    },
    "/api/ping": {
      get: {
        tags: ["Meta"],
        summary: "Liveness probe",
        responses: {
          ...ok200("Service is up.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              status: { type: "string", example: "healthy" },
              service: { type: "string" },
              version: { type: "string" },
            },
          }),
        },
      },
    },
    "/api/openapi": {
      get: {
        tags: ["Meta"],
        summary: "This specification",
        responses: {
          ...ok200("The OpenAPI document, with `servers` set to the host it was fetched from.", {
            type: "object",
          }),
          ...NOT_ALLOWED,
        },
      },
    },

    // ── Catalog ─────────────────────────────────────────────────────────────
    "/api/products": {
      get: {
        tags: ["Catalog"],
        summary: "List products",
        description: "Filters and sorts the catalog. All parameters are optional and combine.",
        parameters: [
          {
            name: "category",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["all", "living", "dining", "bedroom", "lighting", "decor"] },
            description: "'all' or omitted returns every category.",
          },
          {
            name: "search",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Case-insensitive substring match on product name only — not description.",
            example: "sofa",
          },
          {
            name: "sort",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["price_asc", "price_desc", "newest"] },
            description: "Omitted leaves catalog order.",
          },
        ],
        responses: {
          ...ok200("Matching products. `count: 0` with an empty array if nothing matched — not a 404.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              count: { type: "integer" },
              products: { type: "array", items: PRODUCT_SCHEMA },
            },
          }),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/products/{product_id}": {
      get: {
        tags: ["Catalog"],
        summary: "Get one product",
        parameters: [PRODUCT_ID_PARAM],
        responses: {
          ...ok200("Product details, flattened into the top level of the response.", {
            allOf: [{ type: "object", properties: { ok: OK_TRUE } }, PRODUCT_SCHEMA],
          }),
          ...errRes(404, "No such product.", ["product_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/products/{product_id}/reviews": {
      get: {
        tags: ["Catalog"],
        summary: "Get product reviews",
        description: "Returns the average across all reviews, but only the 3 most recent review bodies.",
        parameters: [PRODUCT_ID_PARAM],
        responses: {
          ...ok200("Review summary. A product with no reviews returns `average_rating: null`, `review_count: 0`.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              product_id: { type: "string" },
              average_rating: {
                type: "number", nullable: true,
                description: "Mean of all reviews, 1 decimal place. Null when there are none.",
                example: 4.3,
              },
              review_count: { type: "integer", description: "Total reviews, not the number returned." },
              reviews: {
                type: "array",
                description: "The 3 most recent reviews only.",
                items: {
                  type: "object",
                  properties: {
                    reviewer: { type: "string" },
                    rating: { type: "integer", minimum: 1, maximum: 5 },
                    comment: { type: "string" },
                    date: { type: "string", format: "date" },
                  },
                },
              },
            },
          }),
          ...errRes(404, "No such product.", ["product_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },

    // ── Customer ────────────────────────────────────────────────────────────
    "/api/customers/{customer_id}": {
      get: {
        tags: ["Customer"],
        summary: "Get customer account",
        description: "Profile, default address, payment method on file, and the IDs of all their orders.",
        parameters: [CUSTOMER_ID_PARAM],
        responses: {
          ...ok200("Account details.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              customer_id: { type: "string" },
              name: { type: "string", example: "Priya Sharma" },
              email: { type: "string", format: "email" },
              phone: { type: "string", nullable: true },
              account_created: { type: "string", format: "date" },
              marketing_opt_in: { type: "boolean" },
              state: { type: "string", description: "Two-letter state code.", example: "MH" },
              address: ADDRESS_SCHEMA,
              orders: {
                type: "array",
                items: { type: "string" },
                description: "Order IDs. Use /api/customers/{id}/orders for the full records.",
              },
              ak_hi_customer: {
                type: "boolean",
                description: "Remote-region flag (state AK or HI). Affects shipping expectations.",
              },
              account_status: { type: "string", example: "active" },
              payment_method: {
                type: "object", nullable: true,
                description: "Card on file. Check `is_expired` before discussing refunds to it.",
                properties: {
                  type: { type: "string", example: "visa" },
                  last_four: { type: "string", example: "4242" },
                  expiry_month: { type: "string", example: "08" },
                  expiry_year: { type: "string", example: "2026" },
                  is_expired: { type: "boolean" },
                },
              },
            },
          }),
          ...errRes(404, "No such customer.", ["customer_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/customers/{customer_id}/orders": {
      get: {
        tags: ["Customer"],
        summary: "List a customer's orders",
        description:
          "Full order records, newest first. Start here when a customer asks about 'my order' without giving an ID.",
        parameters: [CUSTOMER_ID_PARAM],
        responses: {
          ...ok200("Order history. `total_orders: 0` with an empty array if they have never ordered.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              customer_id: { type: "string" },
              total_orders: { type: "integer" },
              order_ids: { type: "array", items: { type: "string" }, description: "Newest first." },
              orders: { type: "array", items: ORDER_SCHEMA },
            },
          }),
          ...errRes(404, "No such customer.", ["customer_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/customers/{customer_id}/returns": {
      get: {
        tags: ["Customer"],
        summary: "List a customer's returns",
        description:
          "Returns and refunds, newest first. Start here for 'where is my refund?' when the customer has not quoted a return ID.",
        parameters: [CUSTOMER_ID_PARAM],
        responses: {
          ...ok200("Return history. `total_returns: 0` with an empty array if they have never returned anything.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              customer_id: { type: "string" },
              total_returns: { type: "integer" },
              return_ids: { type: "array", items: { type: "string" }, description: "Newest first." },
              returns: { type: "array", items: RETURN_SCHEMA },
            },
          }),
          ...errRes(404, "No such customer.", ["customer_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/customers/{customer_id}/addresses": {
      get: {
        tags: ["Customer"],
        summary: "List saved addresses",
        description: "Every customer has exactly one address, always `addr_default`.",
        parameters: [CUSTOMER_ID_PARAM],
        responses: {
          ...ok200("Saved addresses.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              customer_id: { type: "string" },
              addresses: {
                type: "array",
                items: {
                  allOf: [
                    {
                      type: "object",
                      properties: {
                        address_id: { type: "string", example: "addr_default" },
                        is_default: { type: "boolean" },
                      },
                    },
                    ADDRESS_SCHEMA,
                  ],
                },
              },
            },
          }),
          ...errRes(404, "No such customer.", ["customer_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },

    // ── Cart ────────────────────────────────────────────────────────────────
    "/api/cart/{customer_id}": {
      get: {
        tags: ["Cart"],
        summary: "Get cart contents",
        parameters: [CUSTOMER_ID_PARAM],
        responses: {
          ...ok200("Cart totals and lines. An empty cart is a normal 200.", CART_SCHEMA),
          ...errRes(404, "No such customer.", ["customer_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/cart/{customer_id}/add": {
      post: {
        tags: ["Cart"],
        summary: "Add an item to the cart",
        description:
          "Adds to the existing quantity rather than replacing it. Stock is checked against the resulting total, so the error message reports what is already in the cart.",
        parameters: [CUSTOMER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["product_id"],
          properties: {
            product_id: { type: "string", example: "prod_001" },
            quantity: { type: "integer", default: 1, minimum: 1, description: "Added to the current quantity." },
          },
        }),
        responses: {
          ...ok200("The full updated cart.", CART_SCHEMA),
          ...errRes(
            400,
            "Missing product_id, or not enough stock for the resulting quantity.",
            ["missing_field", "out_of_stock", "insufficient_stock"]
          ),
          ...errRes(404, "No such customer or product.", ["customer_not_found", "product_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/cart/{customer_id}/update": {
      post: {
        tags: ["Cart"],
        summary: "Set an item's quantity",
        description:
          "Sets the absolute quantity, unlike /add. `quantity: 0` or negative removes the line. Silently does nothing if the product is not already in the cart.",
        parameters: [CUSTOMER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["product_id", "quantity"],
          properties: {
            product_id: { type: "string", example: "prod_001" },
            quantity: { type: "integer", description: "Absolute new quantity. 0 or less removes the item." },
          },
        }),
        responses: {
          ...ok200("The full updated cart.", CART_SCHEMA),
          ...errRes(400, "Missing fields, or not enough stock.", [
            "missing_field",
            "out_of_stock",
            "insufficient_stock",
          ]),
          ...errRes(404, "No such customer.", ["customer_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/cart/{customer_id}/remove": {
      post: {
        tags: ["Cart"],
        summary: "Remove an item from the cart",
        description: "Idempotent — removing something not in the cart still returns 200.",
        parameters: [CUSTOMER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["product_id"],
          properties: { product_id: { type: "string", example: "prod_001" } },
        }),
        responses: {
          ...ok200("The full updated cart.", CART_SCHEMA),
          ...errRes(400, "Missing product_id.", ["missing_field"]),
          ...errRes(404, "No such customer.", ["customer_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/cart/{customer_id}/checkout": {
      post: {
        tags: ["Cart"],
        summary: "Place an order from the cart",
        description:
          "Creates an order in `processing`, decrements stock, and empties the cart. Stock for every line is validated before anything is written, so a failed checkout leaves the cart untouched. Takes no body.",
        parameters: [CUSTOMER_ID_PARAM],
        responses: {
          ...ok200("Order created.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              order_id: { type: "string", example: "ORD-20000" },
              price_total: { type: "integer", description: "Rupees, excluding shipping." },
              price_total_formatted: { type: "string", example: "₹89,999" },
              estimated_delivery: { type: "string", format: "date" },
              shipping_method: { type: "string", enum: ["standard", "large_item"] },
              status: { type: "string", enum: ["processing"] },
            },
          }),
          ...errRes(400, "Cart is empty, or an item went out of stock since it was added.", [
            "empty_cart",
            "out_of_stock",
            "insufficient_stock",
          ]),
          ...errRes(404, "No such customer.", ["customer_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },

    // ── Orders ──────────────────────────────────────────────────────────────
    "/api/orders/{order_id}": {
      get: {
        tags: ["Orders"],
        summary: "Get an order",
        description:
          "The primary order lookup: status, items, tracking, delivery address, and the `cancellable` flag.",
        parameters: [ORDER_ID_PARAM],
        responses: {
          ...ok200("Order details.", ORDER_SCHEMA),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/orders/{order_id}/cancel": {
      post: {
        tags: ["Orders"],
        summary: "Cancel an order",
        description:
          "Only works while the order is `processing`. **An order past processing returns HTTP 200 with `ok: false` and `cancelled: false`** — check the field, not the status code. Restores stock for orders placed through checkout.",
        parameters: [ORDER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["customer_id", "reason"],
          properties: {
            customer_id: { type: "string", description: "Must match the order's owner.", example: "cust_001" },
            reason: {
              type: "string",
              enum: ["changed my mind", "ordered by mistake", "found better price", "delivery too slow", "other"],
              description: "Must be one of these exact strings.",
            },
          },
        }),
        responses: {
          200: {
            description:
              "Two outcomes, distinguished by `ok`. `ok: true` — cancelled. `ok: false` — declined because the order is no longer cancellable.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    {
                      title: "Cancelled",
                      type: "object",
                      properties: {
                        ok: OK_TRUE,
                        cancelled: { type: "boolean", enum: [true] },
                        order_id: { type: "string" },
                        refund_method: { type: "string", example: "original_payment_method" },
                        refund_timeline: {
                          type: "string",
                          example:
                            "5–7 business days to your original payment method, plus 2–5 business days for your bank to process.",
                        },
                      },
                    },
                    {
                      title: "Declined — not cancellable, or a return is open",
                      type: "object",
                      properties: {
                        ok: { type: "boolean", enum: [false] },
                        cancelled: { type: "boolean", enum: [false] },
                        reason: {
                          type: "string",
                          description:
                            "Either the order has moved past `processing`, or a return is already in flight for it — cancelling as well would refund the same item twice.",
                          example: "order not cancellable",
                        },
                        current_status: { type: "string" },
                        open_return_ids: {
                          type: "array",
                          items: { type: "string" },
                          description:
                            "Present only when the refusal was caused by open returns. Tell the customer their return is already being processed rather than offering to cancel.",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          ...errRes(400, "Missing customer_id or reason, or reason not in the accepted list.", [
            "missing_field",
            "invalid_reason",
          ]),
          ...errRes(403, "customer_id does not own this order.", ["ownership_mismatch"]),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/orders/{order_id}/address": {
      post: {
        tags: ["Orders"],
        summary: "Change the delivery address",
        description: "Only while `processing`. Replaces the whole address — all four fields are required.",
        parameters: [ORDER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["customer_id", "street", "city", "state", "pincode"],
          properties: {
            customer_id: { type: "string", description: "Must match the order's owner." },
            street: { type: "string", example: "12 Rosewood Lane, Bandra West" },
            city: { type: "string", example: "Mumbai" },
            state: { type: "string", example: "MH" },
            pincode: { type: "string", example: "400050" },
          },
        }),
        responses: {
          ...ok200("Address updated. Echoes the new address.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              order_id: { type: "string" },
              street: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
              pincode: { type: "string" },
              message: { type: "string", example: "Delivery address updated successfully." },
            },
          }),
          ...errRes(
            400,
            "Missing fields, or the order has left `processing` (`address_update_not_allowed` — the message names the current status).",
            ["missing_field", "address_update_not_allowed"]
          ),
          ...errRes(403, "customer_id does not own this order.", ["ownership_mismatch"]),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/orders/{order_id}/reschedule/slots": {
      get: {
        tags: ["Orders"],
        summary: "List available delivery slots",
        description:
          "Up to 7 weekday dates starting tomorrow, within the next 14 days. Call this before /reschedule — dates outside this list are rejected.",
        parameters: [ORDER_ID_PARAM],
        responses: {
          ...ok200("Available dates.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              slots: {
                type: "array",
                items: { type: "string", format: "date" },
                description: "Weekdays only. Offer these verbatim.",
              },
            },
          }),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/orders/{order_id}/reschedule": {
      post: {
        tags: ["Orders"],
        summary: "Reschedule delivery",
        description:
          "Allowed while `processing` or `dispatched`. `new_date` must be one of the dates from /reschedule/slots.",
        parameters: [ORDER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["customer_id", "new_date"],
          properties: {
            customer_id: { type: "string", description: "Must match the order's owner." },
            new_date: {
              type: "string",
              format: "date",
              description: "Must exactly match a slot from GET /api/orders/{order_id}/reschedule/slots.",
            },
          },
        }),
        responses: {
          ...ok200("Delivery rescheduled.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              order_id: { type: "string" },
              new_estimated_delivery: { type: "string", format: "date" },
              message: { type: "string", example: "Delivery rescheduled to 2026-08-05." },
            },
          }),
          ...errRes(
            400,
            "Missing customer_id; order already in transit or delivered (`reschedule_not_allowed`); or new_date is not an available slot (`invalid_date` — the message lists the valid ones).",
            ["missing_field", "reschedule_not_allowed", "invalid_date"]
          ),
          ...errRes(403, "customer_id does not own this order.", ["ownership_mismatch"]),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/orders/{order_id}/return-eligibility": {
      get: {
        tags: ["Orders"],
        summary: "Check whether an order can be returned",
        description:
          "Read-only. Always call this before offering a return — it explains *why* in `reason`, in customer-ready wording. Requires no customer_id.",
        parameters: [ORDER_ID_PARAM],
        responses: {
          ...ok200(
            "Eligibility verdict. Note the envelope is `ok: true` even when `eligible: false` — the check succeeded, the return is what is refused.",
            {
              type: "object",
              properties: {
                ok: OK_TRUE,
                order_id: { type: "string" },
                eligible: { type: "boolean" },
                reason: {
                  type: "string",
                  description: "Customer-ready explanation, for either verdict.",
                  example: "Item is within the 30-day return window (12 days remaining).",
                },
                return_window_days: { type: "integer", nullable: true, example: 30 },
                return_window_expires_on: {
                  type: "string", nullable: true,
                  format: "date",
                  description: "Null until the order is delivered.",
                },
                days_remaining: { type: "integer", nullable: true, example: 12 },
                return_shipping_cost: {
                  type: "string", nullable: true,
                  description: "Free for defective/damaged, ₹200–₹500 for change of mind.",
                },
                refund_locked: {
                  type: "boolean",
                  description:
                    "Present only when true: eligible to return, but the refund is held pending review of an active damage claim.",
                },
                refund_locked_reason: { type: "string", example: "damage_claim_under_review" },
              },
            }
          ),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/orders/{order_id}/returns": {
      post: {
        tags: ["Orders"],
        summary: "File a return",
        description:
          "Creates a return and issues a shipping label. **An ineligible order returns HTTP 200 with `ok: false`** — check the field, not the status code. Call /return-eligibility first. " +
          "Filing with `return_reason: 'damaged on arrival'` opens a damage claim: the return comes back `refund_locked: true` with **`estimated_refund_date: null`**, because the refund is held pending inspection and no date can honestly be quoted. Do not offer the customer a refund date for these — relay `refund_note` instead. Every other reason gets a date and no lock.\n\nFiling a return does **not** refund anything: the return comes back `refund_status: 'pending'` and stays there until an operator moves it to `processing` and then `issued`. There is no timer. Also note a return covers **every item in the order** — there is no way to return one item out of several, and for the same reason only **one** return can be open per order: filing again while one is in flight is refused with `return_already_open` and the existing return's ID. A completed or rejected return does not block a new one.",
        parameters: [ORDER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["customer_id", "return_reason", "condition", "has_original_packaging"],
          properties: {
            customer_id: { type: "string", description: "Must match the order's owner." },
            return_reason: {
              type: "string",
              enum: [
                "change of mind",
                "item not as described",
                "damaged on arrival",
                "defective",
                "wrong item received",
              ],
              description:
                "Must be one of these exact strings. Everything except 'change of mind' gets free return shipping.",
            },
            condition: { type: "string", enum: ["unused", "opened", "assembled"] },
            has_original_packaging: { type: "boolean", description: "Required — false is a valid answer." },
          },
        }),
        responses: {
          200: {
            description:
              "Two outcomes, distinguished by `ok`. `ok: true` — return filed. `ok: false` — the order is not eligible.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    {
                      title: "Return filed",
                      type: "object",
                      properties: {
                        ok: OK_TRUE,
                        return_id: { type: "string", example: "RET-2210" },
                        status: { type: "string", enum: ["return_requested"] },
                        instructions: { type: "string", description: "Packing and drop-off instructions." },
                        return_shipping_label_url: { type: "string", format: "uri" },
                        return_shipping_cost: {
                          type: "string",
                          description: "'free', or '₹200–₹500 (customer pays)' for change of mind.",
                        },
                        refund_amount: {
                          type: "string",
                          example: "₹8,400",
                          description:
                            "The order total, formatted. This is what the customer gets back; return shipping is not deducted from it and is charged separately.",
                        },
                        refund_status: {
                          type: "string",
                          enum: ["pending"],
                          description:
                            "Always 'pending' on a new return. Nothing is paid out until an operator moves it to processing and then issued — filing a return does not refund anything.",
                        },
                        estimated_refund_date: {
                          type: "string",
                          format: "date",
                          nullable: true,
                          description: "Null when the refund is locked — there is no date to give yet.",
                        },
                        refund_locked: {
                          type: "boolean",
                          description:
                            "Present only when true (damaged on arrival). The refund is held pending inspection.",
                        },
                        refund_locked_reason: { type: "string", example: "damage_claim_under_review" },
                        refund_note: {
                          type: "string",
                          description: "Customer-ready explanation of the hold. Present only alongside refund_locked.",
                        },
                      },
                    },
                    {
                      title: "Declined — not eligible",
                      type: "object",
                      properties: {
                        ok: { type: "boolean", enum: [false] },
                        eligible: { type: "boolean", enum: [false] },
                        reason: {
                          type: "string",
                          description: "Customer-ready explanation, same wording as /return-eligibility.",
                        },
                      },
                    },
                    {
                      title: "Declined — a return is already open",
                      type: "object",
                      properties: {
                        ok: { type: "boolean", enum: [false] },
                        error: { type: "string", enum: ["return_already_open"] },
                        message: {
                          type: "string",
                          description:
                            "Customer-ready. Tell them the existing return is being handled; do not file another.",
                        },
                        open_return_ids: {
                          type: "array",
                          items: { type: "string" },
                          description: "Every return on this order that is not completed or rejected.",
                        },
                        existing_return_id: { type: "string", example: "RET-2210" },
                        existing_return_status: { type: "string", example: "return_requested" },
                        existing_refund_status: { type: "string", example: "pending" },
                      },
                    },
                  ],
                },
              },
            },
          },
          ...errRes(
            400,
            "Missing one of the four required fields (the message names them all), or reason/condition not in the accepted list.",
            ["missing_field", "invalid_reason", "invalid_condition"]
          ),
          ...errRes(403, "customer_id does not own this order.", ["ownership_mismatch"]),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/orders/{order_id}/replacement": {
      post: {
        tags: ["Orders"],
        summary: "Request a replacement instead of a refund",
        description:
          "Requires the same eligibility as a return. Unlike /returns, an ineligible order gets a **400**, not a 200 with `ok: false`. Does not create a trackable record — the returned `replacement_id` cannot be looked up afterwards.",
        parameters: [ORDER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["customer_id"],
          properties: {
            customer_id: { type: "string", description: "Must match the order's owner." },
            reason: { type: "string", description: "Accepted but ignored — not validated or stored." },
            description: { type: "string", description: "Accepted but ignored — not validated or stored." },
          },
        }),
        responses: {
          ...ok200("Replacement requested.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              replacement_id: {
                type: "string",
                example: "REP-2210",
                description: "Reference only. No endpoint retrieves it.",
              },
              status: { type: "string", enum: ["replacement_requested"] },
              estimated_dispatch_date: { type: "string", format: "date" },
            },
          }),
          ...errRes(
            400,
            "Missing customer_id, or the order is not return-eligible (`replacement_not_eligible` — the message includes the eligibility reason).",
            ["missing_field", "replacement_not_eligible"]
          ),
          ...errRes(403, "customer_id does not own this order.", ["ownership_mismatch"]),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },

    // ── Returns ─────────────────────────────────────────────────────────────
    "/api/returns/{return_id}": {
      get: {
        tags: ["Returns"],
        summary: "Get a return and its refund status",
        description:
          "Use /api/customers/{customer_id}/returns first if you do not have the return ID. Check `refund_locked` before promising a refund date, and `requires_agent_escalation` before attempting to resolve the case.",
        parameters: [RETURN_ID_PARAM],
        responses: {
          ...ok200("Return and refund detail. `refund_locked` and `requires_agent_escalation` are absent unless true.", RETURN_SCHEMA),
          ...errRes(404, "No such return.", ["return_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },

    // ── Admin ───────────────────────────────────────────────────────────────
    "/api/admin/orders": {
      get: {
        tags: ["Admin"],
        summary: "All orders grouped by customer",
        description: "Includes customers with zero orders.",
        responses: {
          ...ok200("Every customer with their orders, newest first.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              customers: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    customer_id: { type: "string" },
                    name: { type: "string" },
                    orders: { type: "array", items: ORDER_SCHEMA },
                  },
                },
              },
            },
          }),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/admin/orders/{order_id}": {
      delete: {
        tags: ["Admin"],
        summary: "Delete an order",
        description: "Seeded demo orders (`is_seed: true`) cannot be deleted.",
        parameters: [ORDER_ID_PARAM],
        responses: {
          ...ok200("Order deleted.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              order_id: { type: "string" },
              deleted: { type: "boolean", enum: [true] },
            },
          }),
          ...errRes(400, "Order is a seeded demo fixture.", ["delete_not_allowed"]),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/admin/orders/{order_id}/set-status": {
      post: {
        tags: ["Admin"],
        summary: "Move an order to any status",
        description:
          "Bypasses every transition rule — this is how test scenarios are staged. Setting `cancelled` also sets the order's cancelled flag; it does NOT restore stock (unlike the customer-facing cancel). Moving an order off `delivered` clears any active damage claim, since that claim cannot apply to an undelivered order.",
        parameters: [ORDER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: ["processing", "dispatched", "in_transit", "delivered", "cancelled"],
            },
          },
        }),
        responses: {
          ...ok200("Status set.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              order_id: { type: "string" },
              status: { type: "string" },
              damage_claim_active: { type: "boolean" },
              damage_claim_cleared: {
                type: "boolean",
                description:
                  "Present when moving off `delivered` dropped an active damage claim, which cannot apply to an undelivered order.",
              },
            },
          }),
          ...errRes(400, "Missing status, or not a valid status.", ["invalid_status"]),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/admin/orders/{order_id}/flags": {
      post: {
        tags: ["Admin"],
        summary: "Set damage claim and delivery date",
        description:
          "Stages return-eligibility scenarios. Send either field or both. Backdating `estimated_delivery` more than 30 days is the only way to reach the 'return window expired' branch, since seeded orders are always built relative to today.",
        parameters: [ORDER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          minProperties: 1,
          properties: {
            damage_claim_active: {
              type: "boolean",
              description: "True makes the order return-eligible with free shipping but holds the refund.",
            },
            estimated_delivery: {
              type: "string", nullable: true,
              format: "date",
              description: "YYYY-MM-DD, or null to clear. Start of the 30-day return window.",
            },
          },
        }),
        responses: {
          ...ok200("Flags updated. Returns the full order.", {
            type: "object",
            properties: { ok: OK_TRUE, order: ORDER_SCHEMA },
          }),
          ...errRes(400, "Neither field supplied, or a value has the wrong type/format.", [
            "missing_field",
            "invalid_field",
          ]),
          ...errRes(404, "No such order.", ["order_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/admin/returns": {
      get: {
        tags: ["Admin"],
        summary: "All returns",
        description:
          "Unlike the public endpoint, every flag is always present (false rather than omitted) so it can be rendered and toggled directly.",
        responses: {
          ...ok200("Every return, newest first.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              total: { type: "integer" },
              returns: {
                type: "array",
                items: {
                  allOf: [
                    RETURN_SCHEMA,
                    {
                      type: "object",
                      properties: {
                        customer_id: { type: "string" },
                        is_seed: { type: "boolean", description: "A demo fixture return." },
                      },
                    },
                  ],
                },
              },
            },
          }),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/admin/returns/{return_id}": {
      delete: {
        tags: ["Admin"],
        summary: "Delete a return",
        description:
          "Removes a return filed through the API, so undoing one test does not need a full reset. Also clears the order's damage claim if no other open damaged-on-arrival return justifies it. A seeded return cannot be deleted: if it has been edited the edit is reverted (`reverted: true`), otherwise this is a 400.",
        parameters: [RETURN_ID_PARAM],
        responses: {
          ...ok200("Deleted, or a seeded return reverted to its original state.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              return_id: { type: "string" },
              deleted: { type: "boolean", description: "False when a seeded return was reverted instead." },
              reverted: { type: "boolean", description: "Present when an edited seeded return was restored." },
              order_id: { type: "string" },
              damage_claim_cleared: {
                type: "boolean",
                description: "Present when the order's damage claim was dropped as a result.",
              },
              message: { type: "string" },
            },
          }),
          ...errRes(400, "Seeded return with no edits to revert.", ["delete_not_allowed"]),
          ...errRes(404, "No such return.", ["return_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/admin/returns/{return_id}/set-status": {
      post: {
        tags: ["Admin"],
        summary: "Advance a return and its refund",
        description:
          "Send either field or both. Dates are filled in automatically to stay consistent: `return_received`/`under_review` sets the received date, refund `processing` sets a +7-business-day ETA, refund `issued` sets the issued date and clears any refund lock.",
        parameters: [RETURN_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          minProperties: 1,
          properties: {
            status: {
              type: "string",
              enum: [
                "return_requested",
                "return_in_transit",
                "return_received",
                "under_review",
                "completed",
                "rejected",
              ],
            },
            refund_status: { type: "string", enum: ["pending", "processing", "issued", "rejected"] },
          },
        }),
        responses: {
          ...ok200("Updated, including the dates that were derived.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              return_id: { type: "string" },
              status: { type: "string" },
              refund_status: { type: "string" },
              return_received_date: { type: "string", nullable: true, format: "date" },
              refund_estimated_date: { type: "string", nullable: true, format: "date" },
              refund_issued_date: { type: "string", nullable: true, format: "date" },
            },
          }),
          ...errRes(400, "Neither field supplied, or a value is not in the accepted list.", [
            "missing_field",
            "invalid_status",
            "invalid_refund_status",
          ]),
          ...errRes(404, "No such return.", ["return_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/admin/returns/{return_id}/flags": {
      post: {
        tags: ["Admin"],
        summary: "Set refund lock and escalation",
        description:
          "Stages the two hardest cases for a support agent: a refund held under review, and a case needing human handoff. Send either field or both. Setting a flag false clears its reason.",
        parameters: [RETURN_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          minProperties: 1,
          properties: {
            refund_locked: { type: "boolean" },
            refund_locked_reason: {
              type: "string",
              enum: ["damage_claim_under_review", "non_returnable_item", "manual_review_requested"],
              description: "Only with refund_locked: true. Defaults to damage_claim_under_review.",
            },
            requires_agent_escalation: { type: "boolean" },
            escalation_reason: {
              type: "string",
              example: "refund_overdue",
              description: "Only with requires_agent_escalation: true. Defaults to manual_review_requested.",
            },
          },
        }),
        responses: {
          ...ok200("Flags updated. Reasons are null when their flag is false.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              return_id: { type: "string" },
              refund_locked: { type: "boolean" },
              refund_locked_reason: { type: "string", nullable: true },
              requires_agent_escalation: { type: "boolean" },
              escalation_reason: { type: "string", nullable: true },
            },
          }),
          ...errRes(400, "Neither flag supplied, or a value is not a boolean.", [
            "missing_field",
            "invalid_field",
          ]),
          ...errRes(404, "No such return.", ["return_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/admin/products/{product_id}/stock": {
      post: {
        tags: ["Admin"],
        summary: "Set a product's stock level",
        description: "Sets the absolute count. `stock_status` is derived: 0 = out_of_stock, 1-3 = low_stock.",
        parameters: [PRODUCT_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["stock"],
          properties: {
            stock: { type: "integer", minimum: 0, description: "Must be a JSON number, not a string." },
          },
        }),
        responses: {
          ...ok200("Stock set.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              product_id: { type: "string" },
              name: { type: "string" },
              stock: { type: "integer" },
              stock_status: { type: "string", enum: ["in_stock", "low_stock", "out_of_stock"] },
            },
          }),
          ...errRes(400, "stock missing, not an integer, or negative.", ["invalid_stock"]),
          ...errRes(404, "No such product.", ["product_not_found"]),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/admin/log": {
      get: {
        tags: ["Admin"],
        summary: "Read the API request log",
        description:
          "Every call that went through the API, newest first, capped at 500 entries. Requests to the log itself and to /api/openapi are excluded. Returns an empty list with `enabled: false` when the REQUEST_LOG environment variable is not set.",
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 500 },
            description: "How many to return. Clamped to 500. Invalid values are ignored.",
          },
        ],
        responses: {
          ...ok200("Recorded requests.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              enabled: {
                type: "boolean",
                description: "False means nothing is being recorded — an empty list is expected, not a sign of no traffic.",
              },
              max_entries: { type: "integer", description: "Cap on retained entries." },
              count: { type: "integer" },
              entries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ts: { type: "string", format: "date-time" },
                    method: { type: "string", example: "POST" },
                    path: { type: "string", description: "Includes the query string.", example: "/api/products?search=sofa" },
                    status: { type: "integer", example: 200 },
                    ok: {
                      type: "boolean",
                      nullable: true,
                      description:
                        "The response body's `ok`, not the HTTP status. `status: 200` with `ok: false` is a business refusal.",
                    },
                    error: { type: "string", description: "Present when the response carried an error code." },
                    reason: { type: "string", description: "Present on a 200 business refusal." },
                    body: {
                      type: "object",
                      description: "Request body, for mutations only. Truncated to a string past 500 characters.",
                    },
                    ms: { type: "integer", description: "Handler duration including store round trips." },
                  },
                },
              },
            },
          }),
          ...NOT_ALLOWED,
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "Clear the request log",
        description: "Independent of /api/admin/reset, which leaves the log intact.",
        responses: {
          ...ok200("Log cleared.", {
            type: "object",
            properties: { ok: OK_TRUE, cleared: { type: "boolean", enum: [true] } },
          }),
          ...NOT_ALLOWED,
        },
      },
    },
    "/api/admin/reset": {
      post: {
        tags: ["Admin"],
        summary: "Reset all demo data",
        description:
          "Deletes every order created through checkout, clears all carts, discards all returns filed since the last reset, reverts edits to seeded returns, restores original stock, and rebuilds the seeded orders relative to today. Takes no body.",
        responses: {
          ...ok200("Reset complete.", {
            type: "object",
            properties: { ok: OK_TRUE, message: { type: "string" } },
          }),
          ...NOT_ALLOWED,
        },
      },
    },
  },
};

/**
 * Stable operation IDs, kept in one list rather than inline.
 *
 * Agent platforms derive the tool name the model sees from `operationId`, so
 * these are the names Fin will reason about — hence deliberate verbs rather than
 * something generated from the path. Renaming one renames a tool, which can
 * invalidate an agent's existing instructions; treat them as a public contract.
 *
 * Collected here so `buildSpec` can assert every operation has one: a new
 * endpoint added to `paths` without an entry fails loudly instead of shipping
 * with a missing tool name.
 */
const OPERATION_IDS: Record<string, string> = {
  "GET /api/health": "getHealth",
  "GET /api/ping": "ping",
  "GET /api/openapi": "getOpenApiSpec",

  "GET /api/products": "listProducts",
  "GET /api/products/{product_id}": "getProduct",
  "GET /api/products/{product_id}/reviews": "getProductReviews",

  "GET /api/customers/{customer_id}": "getCustomer",
  "GET /api/customers/{customer_id}/orders": "listCustomerOrders",
  "GET /api/customers/{customer_id}/returns": "listCustomerReturns",
  "GET /api/customers/{customer_id}/addresses": "listCustomerAddresses",

  "GET /api/cart/{customer_id}": "getCart",
  "POST /api/cart/{customer_id}/add": "addToCart",
  "POST /api/cart/{customer_id}/update": "updateCartItem",
  "POST /api/cart/{customer_id}/remove": "removeFromCart",
  "POST /api/cart/{customer_id}/checkout": "checkout",

  "GET /api/orders/{order_id}": "getOrder",
  "POST /api/orders/{order_id}/cancel": "cancelOrder",
  "POST /api/orders/{order_id}/address": "updateOrderAddress",
  "GET /api/orders/{order_id}/reschedule/slots": "listRescheduleSlots",
  "POST /api/orders/{order_id}/reschedule": "rescheduleDelivery",
  "GET /api/orders/{order_id}/return-eligibility": "checkReturnEligibility",
  "POST /api/orders/{order_id}/returns": "createReturn",
  "POST /api/orders/{order_id}/replacement": "requestReplacement",

  "GET /api/returns/{return_id}": "getReturn",

  "GET /api/admin/orders": "adminListOrders",
  "DELETE /api/admin/orders/{order_id}": "adminDeleteOrder",
  "DELETE /api/admin/returns/{return_id}": "adminDeleteReturn",
  "POST /api/admin/orders/{order_id}/set-status": "adminSetOrderStatus",
  "POST /api/admin/orders/{order_id}/flags": "adminSetOrderFlags",
  "GET /api/admin/returns": "adminListReturns",
  "POST /api/admin/returns/{return_id}/set-status": "adminSetReturnStatus",
  "POST /api/admin/returns/{return_id}/flags": "adminSetReturnFlags",
  "POST /api/admin/products/{product_id}/stock": "adminSetProductStock",
  "GET /api/admin/log": "adminReadRequestLog",
  "DELETE /api/admin/log": "adminClearRequestLog",
  "POST /api/admin/reset": "adminResetDemo",
};

/**
 * The spec with `servers` pointed at `baseUrl` and every operation given its ID.
 *
 * baseUrl is derived from the incoming request rather than hardcoded, so the
 * same code serves a usable spec from localhost and from a deployment. Without a
 * concrete server URL, importers have nothing to resolve paths against.
 */
export function buildSpec(baseUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, Record<string, unknown>>> = JSON.parse(
    JSON.stringify(OPENAPI_SPEC.paths)
  );

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const key = `${method.toUpperCase()} ${path}`;
      const id = OPERATION_IDS[key];
      if (!id) {
        throw new Error(`openapi: no operationId defined for ${key} — add one to OPERATION_IDS.`);
      }
      operation.operationId = id;
    }
  }

  return {
    ...OPENAPI_SPEC,
    servers: [{ url: baseUrl, description: "This deployment." }],
    paths,
  };
}
