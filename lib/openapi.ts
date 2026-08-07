/**
 * OpenAPI 3.0 description of the NestKart mock API.
 *
 * This is the contract an AI support agent (Intercom Fin and similar) is pointed
 * at to derive its tool definitions. It is hand-maintained: nothing generates it
 * from the route files, so a new or changed endpoint under pages/api must be
 * reflected here too or the agent will keep calling the old shape.
 *
 * One convention matters more than anything else here, and is spelled out in the
 * top-level `description` because an agent reading only the schemas would get it
 * wrong: every response carries a boolean `ok`, and every refusal — whether the
 * request was malformed or the action was declined for business reasons (order
 * not cancellable, return not eligible, a return already open) — is a 4xx
 * carrying an `error` code. `ok` and the HTTP status always agree here; still
 * branch on `ok`, not the status, since the two used to disagree and older
 * client code may assume they still do.
 */

const DESCRIPTION = `Mock e-commerce backend for NestKart, a furniture and home-goods retailer.
Used to exercise AI support agents against realistic order, return, and refund flows.

## Reading responses

Branch on the \`ok\` field. In this API it always agrees with the HTTP status —
\`ok: true\` is 200, \`ok: false\` is always a 4xx — but check \`ok\` anyway rather
than assuming that holds.

Every refusal, whether the request was malformed or the action was declined for
business reasons (order not cancellable, a return already in flight, an order
not eligible for return), carries a machine-readable \`error\` code and either a
\`message\` or \`reason\` field with prose suitable for relaying to the customer.
Treat any \`ok: false\` as a failure.

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
customer-facing. An AI support agent should not be given these as tools.

## Cart and Catalog

The \`Cart\` and \`Catalog\` tags are shopping — browsing and building a cart,
which the storefront UI handles directly. A support agent's job is order,
return, and refund flows *after* a purchase, so it should not be given these
as tools either, same as \`Admin\`. Give it \`Customer\`, \`Orders\`, and
\`Returns\`.`;

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

/**
 * Shape returned by buildOrderResponse — the order itself, with nothing
 * envelope-shaped on it. GET /orders/{id} adds `ok` and `customer_id`; the
 * admin order lists add `customer_id` and `is_seed`.
 */
const ORDER_SCHEMA = {
  type: "object",
  properties: {
    order_id: { type: "string", example: "ORD-10101" },
    items: { type: "array", items: ORDER_ITEM_SCHEMA },
    item_summary: {
      type: "string",
      description: "The items as one line, for reading back to a customer. Empty string if the order has no items.",
      example: "Linen Cloud Sofa x1, Terracotta Vase x2",
    },
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
        "An item was reported damaged on arrival. Makes the order return-eligible regardless of the 30-day window, with free return shipping. Set by filing a 'damaged on arrival' return; cleared when that return closes.",
    },
    tracking_number: {
      type: "string", nullable: true,
      description: "Null until the order is dispatched.",
      example: "NK10101TRACK",
    },
    tracking_url: { type: "string", nullable: true, example: "https://track.nestkart.com/NK10101TRACK" },
    return_id: {
      type: "string",
      description:
        "Every return filed against this order, newest first, comma-separated in one string — `\"\"` if none, and more than one when a rejected return was re-filed (`\"RET-2210, RET-2201\"`). Includes closed ones. There is no GET on /orders/{order_id}/returns, so this is how you get from an order to its returns; split on `\", \"` and pass an id to GET /api/returns/{return_id} for the detail.",
      example: "RET-2201",
    },
    cancellable: {
      type: "boolean",
      description:
        "Whether POST /cancel would be accepted right now. **Check this rather than inferring from `status`** — an open return blocks cancelling too, and that is not visible anywhere else on the order.",
    },
    reschedulable: {
      type: "boolean",
      description:
        "Whether POST /reschedule would be accepted right now. **Check this rather than inferring from `status`** — an open return or a requested replacement blocks rescheduling too, and neither is visible anywhere else on the order.",
    },
    returnable: {
      type: "boolean",
      description:
        "Whether POST /returns would be accepted right now. Stricter than /return-eligibility, which ignores an already-open return and an already-requested replacement.",
    },
    replaceable: {
      type: "boolean",
      description:
        "Whether POST /replacement would be accepted right now. Always identical to `returnable` — both are gated on the same three conditions.",
    },
  },
};

/** ORDER_SCHEMA as GET /orders/{id} returns it: the object is the response. */
const SINGLE_ORDER_SCHEMA = {
  type: "object",
  properties: {
    ok: OK_TRUE,
    customer_id: {
      type: "string",
      example: "cust_001",
      description: "The order's owner. Check it before acting on a customer's behalf.",
    },
    ...ORDER_SCHEMA.properties,
  },
};

/** ORDER_SCHEMA as the admin lists return it. */
const ADMIN_ORDER_SCHEMA = {
  type: "object",
  properties: {
    ...ORDER_SCHEMA.properties,
    customer_id: { type: "string", example: "cust_001" },
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

/** Optional exact-match status filter on the two customer collection endpoints. */
const ORDER_STATUS_FILTER_PARAM = {
  name: "status",
  in: "query",
  required: false,
  description:
    "Return only orders with this status. Omit for the full history. An unrecognised value is a 400, not an empty list.",
  schema: {
    type: "string",
    enum: ["processing", "dispatched", "in_transit", "delivered", "cancelled"],
  },
  example: "in_transit",
};

const RETURN_STATUS_FILTER_PARAM = {
  name: "status",
  in: "query",
  required: false,
  description:
    "Return only returns with this status. Omit for all of them. An unrecognised value is a 400, not an empty list.",
  schema: {
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
  example: "under_review",
};

/** One boolean filter per action flag on the orders list — same booleans that
 * appear on each order in the response, made independently queryable. */
const ORDER_ACTION_FILTER_PARAMS = ["cancellable", "reschedulable", "returnable", "replaceable"].map(
  (flag) => ({
    name: flag,
    in: "query",
    required: false,
    description: `Return only orders where \`${flag}\` is this value. Combine freely with \`status\` and the other action filters. An unrecognised value is a 400, not an empty list.`,
    schema: { type: "string", enum: ["true", "false"] },
    example: "true",
  })
);

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
    {
      name: "Catalog",
      description:
        "Products and reviews. Public, no customer context. Browsing is handled by the storefront UI directly — a support agent has no reason to call these.",
    },
    { name: "Customer", description: "Account details, order history, returns history." },
    {
      name: "Cart",
      description:
        "Cart contents and checkout. Shopping is handled by the storefront UI directly — a support agent's job is order/return/refund flows after a purchase, not building a cart, so it has no reason to call these either.",
    },
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
              address: ADDRESS_SCHEMA,
              orders: {
                type: "array",
                items: { type: "string" },
                description: "Order IDs. Use /api/customers/{id}/orders for the full records.",
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
    "/api/customers/{customer_id}/update": {
      post: {
        tags: ["Customer"],
        summary: "Update customer contact details",
        description:
          "Updates name, email and/or phone. Partial — only fields present in the body change; provide at least one.\n\n**Does not change any address.** The customer's profile address is read-only here; to change where an order is going, use POST /orders/{order_id}/address, which edits that order's own `delivery_address`. Those snapshots are taken at checkout and are what actually determines delivery.",
        parameters: [CUSTOMER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          properties: {
            name: { type: "string", example: "Priya Sharma" },
            email: {
              type: "string",
              format: "email",
              example: "priya@example.com",
              description:
                "Must look like an address — one @, no whitespace, a dot-suffixed domain. Rejected with `invalid_field` otherwise.",
            },
            phone: {
              type: "string",
              example: "919810012345",
              description:
                "Digits only — no '+', spaces, dashes or brackets. Include the country code as digits. Rejected with `invalid_field` otherwise.",
            },
          },
        }),
        responses: {
          ...ok200("Updated. Echoes the current name, email and phone.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              customer_id: { type: "string" },
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string", nullable: true, example: "91 98100 12345" },
              message: { type: "string", example: "Profile updated successfully." },
            },
          }),
          ...errRes(
            400,
            "No fields provided, or one of the provided fields is empty or the wrong type.",
            ["missing_field", "invalid_field"]
          ),
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
          "Full order records, newest first. Start here when a customer asks about 'my order' without giving an ID. Pass `status` to narrow the list, or any of `cancellable`/`reschedulable`/`returnable`/`replaceable` to filter by what's still actionable — `total_orders`, `order_ids` and `return_ids` all describe the filtered set.",
        parameters: [CUSTOMER_ID_PARAM, ORDER_STATUS_FILTER_PARAM, ...ORDER_ACTION_FILTER_PARAMS],
        responses: {
          ...ok200("Order history. `total_orders: 0` with an empty array if they have never ordered.", {
            type: "object",
            properties: {
              ok: OK_TRUE,
              customer_id: { type: "string" },
              total_orders: { type: "integer" },
              order_ids: { type: "array", items: { type: "string" }, description: "Newest first." },
              return_ids: {
                type: "array",
                items: { type: "string" },
                description:
                  "Every return filed across all of these orders, in the same order the orders are listed — `[]` if there are none. Each order's own returns are on it as `return_id`. Pass an id to GET /api/returns/{return_id} for the detail.",
                example: ["RET-2201", "RET-2202"],
              },
              orders: { type: "array", items: ORDER_SCHEMA },
            },
          }),
          ...errRes(400, "A filter value was invalid: an unrecognised `status`, or a `cancellable`/`reschedulable`/`returnable`/`replaceable` value other than 'true' or 'false'.", [
            "invalid_status",
            "invalid_cancellable",
            "invalid_reschedulable",
            "invalid_returnable",
            "invalid_replaceable",
          ]),
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
          "Returns and refunds, newest first. Start here for 'where is my refund?' when the customer has not quoted a return ID. Pass `status` to narrow the list — `total_returns` and `return_ids` describe the filtered set.",
        parameters: [CUSTOMER_ID_PARAM, RETURN_STATUS_FILTER_PARAM],
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
          ...errRes(400, "The `status` filter is not a valid return status.", ["invalid_status"]),
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
          "The primary order lookup: status, items, tracking, and delivery address. Read `actions` to find out what you can offer the customer — cancelling, rescheduling, returning or replacing — and the reason when you cannot. Cancellability does **not** follow from `status` alone: an open return blocks it too.",
        parameters: [ORDER_ID_PARAM],
        responses: {
          ...ok200("Order details.", SINGLE_ORDER_SCHEMA),
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
          "Only works while the order is `processing`, and only if nothing else has already been promised for it — no open return, no requested replacement. A refusal is a **400** carrying an `error` code — `order_not_cancellable`, `return_in_progress` or `replacement_already_requested`. Check `cancellable` on the order rather than inferring from `status`. Restores stock for orders placed through checkout, once.",
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
            description: "Cancelled.",
            content: {
              "application/json": {
                schema: {
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
              },
            },
          },
          400: {
            description:
              "Rejected. `missing_field` / `invalid_reason` mean the request was malformed. `order_not_cancellable` means the order has moved past `processing`; `return_in_progress` means a return is already in flight for it, and cancelling as well would refund the same item twice; `replacement_already_requested` means a new unit is already owed, so cancelling would hand over both the goods and the money.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", enum: [false] },
                    error: {
                      type: "string",
                      enum: [
                        "missing_field",
                        "invalid_reason",
                        "order_not_cancellable",
                        "return_in_progress",
                        "replacement_already_requested",
                      ],
                    },
                    message: { type: "string", description: "Present on the malformed-request errors." },
                    cancelled: {
                      type: "boolean",
                      enum: [false],
                      description: "Present on the business refusals, not on the malformed-request errors.",
                    },
                    reason: {
                      type: "string",
                      description:
                        "Prose for the customer. Present on the business refusals, not on the malformed-request errors.",
                      example: "Order can only be cancelled while it is processing (current: delivered).",
                    },
                    current_status: { type: "string" },
                    open_return_ids: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Present only on `return_in_progress`. Tell the customer their return is already being processed rather than offering to cancel.",
                    },
                  },
                },
              },
            },
          },
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
          "Up to 7 weekday dates, within 14 days of where they start. Slots begin the day after the order's current `estimated_delivery` — a delivery can be pushed back but not pulled forward — falling back to tomorrow if that date is missing or already past. Call this before /reschedule — dates outside this list are rejected. Mirrors every refusal the POST makes (`reschedule_not_allowed`, `return_in_progress`, `replacement_already_requested`), so a slot list is never offered for an order that can't actually be rescheduled.",
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
          ...errRes(
            400,
            "Order already in transit or delivered (`reschedule_not_allowed`); a return is open on it (`return_in_progress`); or a replacement was already requested for it (`replacement_already_requested`).",
            ["reschedule_not_allowed", "return_in_progress", "replacement_already_requested"]
          ),
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
          "Allowed while `processing` or `dispatched`, and only if no return is open on the order and no replacement has been requested for it — there is no live delivery to move in either case, and rescheduling would rewrite `estimated_delivery`, which anchors the 30-day return window. Check `reschedulable` on the order rather than inferring from `status`. `new_date` must be one of the dates from /reschedule/slots.",
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
            "Missing customer_id; order already in transit or delivered (`reschedule_not_allowed`); a return is open on it (`return_in_progress`); a replacement was already requested for it (`replacement_already_requested`); or new_date is not an available slot (`invalid_date` — the message lists the valid ones).",
            [
              "missing_field",
              "reschedule_not_allowed",
              "return_in_progress",
              "replacement_already_requested",
              "invalid_date",
            ]
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
          "Read-only, and narrower than it sounds: this answers whether the order is **within the return window** — delivered, not cancelled, inside 30 days. It does not consider a return that is already open or a replacement already requested, so `eligible: true` here does not guarantee POST /returns will succeed. For the complete answer use `actions.returnable` on the order. Requires no customer_id.",
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
          "Creates a return and issues a shipping label. An ineligible order, one with a return already open, or one with a replacement already requested, is refused with a **400** and an `error` code (`return_not_eligible`, `return_already_open`, or `replacement_already_requested`). Call /return-eligibility first. " +
          "Filing with `return_reason: 'damaged on arrival'` opens a damage claim on the order, which earns free return shipping.\n\nFiling a return does **not** refund anything: the return comes back `refund_status: 'pending'` and stays there until an operator moves it to `processing` and then `issued`. There is no timer. Also note a return covers **every item in the order** — there is no way to return one item out of several, and for the same reason only **one** return can be open per order: filing again while one is in flight is refused with `return_already_open` and the existing return's ID. A completed or rejected return does not block a new one.",
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
            description: "Return filed.",
            content: {
              "application/json": {
                schema: {
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
                      description:
                        "Seven business days out. An estimate for the refund once approved, not a promise that it has been.",
                    },
                  },
                },
              },
            },
          },
          400: {
            description:
              "Rejected. `missing_field` / `invalid_reason` / `invalid_condition` mean the request was malformed. `return_not_eligible` means the order fails /return-eligibility; `return_already_open` means a return is already in flight for it; `replacement_already_requested` means a replacement was requested for this order and a return cannot also be filed on top of it.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    {
                      title: "Malformed request",
                      type: "object",
                      properties: {
                        ok: { type: "boolean", enum: [false] },
                        error: { type: "string", enum: ["missing_field", "invalid_reason", "invalid_condition"] },
                        message: {
                          type: "string",
                          description:
                            "Missing one of the four required fields (names them all), or reason/condition not in the accepted list.",
                        },
                      },
                    },
                    {
                      title: "Declined — not eligible",
                      type: "object",
                      properties: {
                        ok: { type: "boolean", enum: [false] },
                        error: { type: "string", enum: ["return_not_eligible"] },
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
                    {
                      title: "Declined — a replacement was already requested",
                      type: "object",
                      properties: {
                        ok: { type: "boolean", enum: [false] },
                        error: { type: "string", enum: ["replacement_already_requested"] },
                        message: {
                          type: "string",
                          description:
                            "Customer-ready. A replacement already covers this order; a full return cannot also be filed.",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
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
          "Requires the same eligibility as a return; an ineligible order gets a **400**, same as /returns. Also refused if a return is already open on the order (`return_in_progress`) or a replacement was already requested for it (`replacement_already_requested`) — a replacement gives a new unit on top of the order, so it cannot stack with a return, which refunds the order in full, or with a second replacement. Does not create a trackable record — the returned `replacement_id` cannot be looked up afterwards, and nothing but this one-request check remembers it happened.",
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
            "Missing customer_id; the order is not return-eligible (`replacement_not_eligible` — the message includes the eligibility reason); a return is already open on it (`return_in_progress`); or a replacement was already requested for it (`replacement_already_requested`).",
            ["missing_field", "replacement_not_eligible", "return_in_progress", "replacement_already_requested"]
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
          "Use /api/customers/{customer_id}/returns first if you do not have the return ID. `refund_status` is the refund signal: nothing is paid out until it reads `issued`.",
        parameters: [RETURN_ID_PARAM],
        responses: {
          ...ok200("Return and refund detail.", RETURN_SCHEMA),
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
                    orders: { type: "array", items: ADMIN_ORDER_SCHEMA },
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
        summary: "Set the delivery date",
        description:
          "Stages return-eligibility scenarios. Backdating `estimated_delivery` more than 30 days is the only way to reach the 'return window expired' branch, since seeded orders are always built relative to today. `damage_claim_active` is not settable here — it belongs to the return lifecycle, set by filing a 'damaged on arrival' return and cleared when that return closes.",
        parameters: [ORDER_ID_PARAM],
        requestBody: jsonBody({
          type: "object",
          required: ["estimated_delivery"],
          properties: {
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
            properties: { ok: OK_TRUE, order: ADMIN_ORDER_SCHEMA },
          }),
          ...errRes(400, "Field not supplied, or its value has the wrong type/format.", [
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
                      description: "The response body's `ok`. Agrees with `status` here: false means a 4xx.",
                    },
                    error: { type: "string", description: "Present when the response carried an error code." },
                    reason: { type: "string", description: "Present on a business refusal." },
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
  "POST /api/customers/{customer_id}/update": "updateCustomerProfile",
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
