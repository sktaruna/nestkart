"""
================================================================================
NestKart Mock API Server — v2.2.0
================================================================================
A mock backend API for NestKart, designed for use with Intercom Fin Actions.
All data is hardcoded in-memory. No database, ORM, or file I/O required.

INSTALL:
    pip install flask flask-cors

RUN LOCALLY:
    python app.py
    Server starts on http://0.0.0.0:5050

    Railway deployment reads PORT from environment and starts via gunicorn.

AUTHENTICATION:
    All endpoints except /api/health and /api/debug/* require auth.
    Two accepted methods (either one works):

    Method 1 — Static header key:
        X-Api-Key: nk-fin-dev-key-2025

    Method 2 — Bearer token:
        Authorization: Bearer nk-bearer-dev-token-2025

    Example (API key):
        curl -H "X-Api-Key: nk-fin-dev-key-2025" \
             http://localhost:5050/api/orders/ORD-10041

    Example (Bearer):
        curl -H "Authorization: Bearer nk-bearer-dev-token-2025" \
             http://localhost:5050/api/customers/cust_001

ENDPOINTS:
    GET  /api/health                                    No auth — health check
    --- Domain A: Orders & Tracking ---
    GET  /api/orders/<order_id>                         Order status & details
    GET  /api/customers/<customer_id>/orders            Customer order history
    POST /api/orders/<order_id>/cancel                  Cancel an order
    --- Domain B: Returns & Refunds ---
    GET  /api/orders/<order_id>/return-eligibility      Check return eligibility
    POST /api/orders/<order_id>/returns                 Initiate a return
    GET  /api/returns/<return_id>                       Return & refund status
    GET  /api/customers/<customer_id>/returns           All returns for customer
    --- Domain A (cont.) ---
    GET  /api/orders/<order_id>/address-change-eligibility  Check address change eligibility
    POST /api/orders/<order_id>/address                 Update delivery address
    POST /api/orders/<order_id>/non-delivery-investigation  Open carrier investigation
    --- Domain B (cont.) ---
    POST /api/returns/<return_id>/replacement           Issue replacement order
    --- Domain C: Account & Profile ---
    GET  /api/customers/<customer_id>                   Customer profile
    GET  /api/customers/<customer_id>/addresses         Saved delivery addresses
    GET  /api/customers/<customer_id>/account-deletion-preview  Deletion impact preview
    POST /api/customers/<customer_id>/delete            Submit account deletion request
    --- Domain D: Products & Inventory ---
    GET  /api/products/<product_id>                     Product details & stock
    GET  /api/products/<product_id>/waitlist            Waitlist info
    POST /api/products/<product_id>/waitlist           Join product waitlist
    --- Domain E: Debug & Testing ---
    GET  /api/debug/force-error?status=<code>           Simulate error states (no auth)
    GET  /api/debug/scenarios                           Test scenario index (no auth)

TEST IDs:
    Customers : cust_001 · cust_002 · cust_003 · cust_004 · cust_005
    Orders    : ORD-10041 · ORD-10052 · ORD-10063 · ORD-10074 · ORD-10085
                ORD-10096 · ORD-10107 · ORD-10118
    Returns   : RET-2201 · RET-2202 · RET-2203
    Products  : prod_001 · prod_002 · prod_003 · prod_004 · prod_005 · prod_006

SECURITY NOTES:
    - Never expose sensitive data (no full card numbers, no passwords)
    - Auth keys are dev/mock only — never use in production
    - /api/health and /api/debug/* endpoints: no auth required
    - Do not cancel ORD-10096 (MTO past cancellation window) regardless of request body
    - Do not confirm refund for RET-2202 (opened candles are non-returnable)
    - Do not confirm refund for RET-2203 until Returns Team review is complete
    - Do not offer autonomous refund for ORD-10118 (active damage claim)
    - Do not confirm cancellation or return eligibility for ORD-10096 without agent escalation

GUARDRAILS — ENFORCEMENT LEVEL:
    Hard (server-enforced — Fin cannot bypass by ignoring fin_note):
        - cancellable / address_changeable flags block cancel & address-change actions
        - return eligibility (eligible: false) blocks return creation for RET-2202, ORD-10096
        - replacement blocked while a return's status == "under_review"
        - replacement blocked autonomously above $300 order value (REPLACEMENT_AUTONOMOUS_LIMIT_USD)
        - refund_locked: true on RET-2203 / ORD-10118 — damage claim under review, do not confirm refund
        - requires_agent_escalation: true on RET-2201 — refund is overdue, escalate to Billing
        - requires_explicit_customer_confirmation: true on account-deletion-preview
        - account deletion requires exact registered_email match before submitting
        - ownership_mismatch (403) on cancel / address-update / initiate-return / replacement
          if the customer_id in the request body does not match the actual order/return owner
    Soft (prose-only via fin_note — Fin must read and obey, not independently verifiable
    by response shape alone):
        - AK/HI surcharge disclosures, restock-date warnings, expired-payment-method flags
        - "read deletion impact aloud" instruction (the confirmation requirement is hard;
          the act of reading it aloud is not machine-checkable)
================================================================================
"""

import os
from datetime import date, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────────────────────────────────────
# AUTH CONFIG
# ─────────────────────────────────────────────────────────────────────────────
VALID_API_KEY = "nk-fin-dev-key-2025"
VALID_BEARER  = "nk-bearer-dev-token-2025"

# Paths that skip auth entirely
NO_AUTH_PATHS = {"/api/health", "/api/debug/force-error", "/api/debug/scenarios"}


# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — CUSTOMERS
# ─────────────────────────────────────────────────────────────────────────────
CUSTOMERS = {
    "cust_001": {
        "customer_id": "cust_001",
        "name": "Priya Sharma",
        "email": "priya@example.com",
        "account_created": "2024-03-10",
        "marketing_opt_in": True,
        "state": "NY",
    },
    "cust_002": {
        "customer_id": "cust_002",
        "name": "James Okafor",
        "email": "james@example.com",
        "account_created": "2023-11-22",
        "marketing_opt_in": False,
        "state": "CA",
    },
    "cust_003": {
        "customer_id": "cust_003",
        "name": "Lisa Tran",
        "email": "lisa@example.com",
        "account_created": "2025-01-05",
        "marketing_opt_in": True,
        "state": "TX",
    },
    "cust_004": {
        "customer_id": "cust_004",
        "name": "Marcus Webb",
        "email": "marcus@example.com",
        "account_created": "2024-08-19",
        "marketing_opt_in": False,
        "state": "AK",
    },
    "cust_005": {
        "customer_id": "cust_005",
        "name": "Anika Rossi",
        "email": "anika@example.com",
        "account_created": "2024-12-01",
        "marketing_opt_in": True,
        "state": "CA",
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — ORDERS
# ─────────────────────────────────────────────────────────────────────────────
ORDERS = {
    "ORD-10041": {
        "order_id":           "ORD-10041",
        "customer_id":        "cust_001",
        "item_name":          "Harlow Sofa (3-seater), Oatmeal",
        "qty":                1,
        "price_total":        "$849.00",
        "status":             "delivered",
        "placed_at":          "2025-05-10T14:22:00-05:00",
        "dispatched_at":      "2025-05-13T09:00:00-05:00",
        "estimated_delivery": "2025-05-18",
        "delivered_at":       "2025-05-18",
        "shipping_method":    "large_item",
        "shipping_cost":      "$49.99",
        "carrier":            "FedEx Freight",
        "tracking_number":    "1Z999AA10123456784",
        "cancellable":        False,
        "address_changeable": False,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10052": {
        "order_id":           "ORD-10052",
        "customer_id":        "cust_001",
        "item_name":          "Soy Wax Candle — Cedarwood & Amber (300g) × 2",
        "qty":                2,
        "price_total":        "$68.00",
        "status":             "in_transit",
        "placed_at":          "2025-06-14T10:05:00-05:00",
        "dispatched_at":      "2025-06-14T16:00:00-05:00",
        "estimated_delivery": "2025-06-19",
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456785",
        "cancellable":        False,
        "address_changeable": False,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10063": {
        "order_id":           "ORD-10063",
        "customer_id":        "cust_002",
        "item_name":          "Elm Dining Table",
        "qty":                1,
        "price_total":        "$429.00",
        "status":             "dispatched",
        "placed_at":          "2025-06-15T09:30:00-05:00",
        "dispatched_at":      "2025-06-16T08:00:00-05:00",
        "estimated_delivery": "2025-06-23",
        "delivered_at":       None,
        "shipping_method":    "large_item",
        "shipping_cost":      "$49.99",
        "carrier":            "FedEx Freight",
        "tracking_number":    "1Z999AA10123456786",
        "cancellable":        False,
        "address_changeable": False,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10074": {
        "order_id":           "ORD-10074",
        "customer_id":        "cust_003",
        "item_name":          "Stoneware Dinner Set (4-piece), Sage Green × 2",
        "qty":                2,
        "price_total":        "$178.00",
        "status":             "processing",
        "placed_at":          "2025-06-17T08:45:00-05:00",
        "dispatched_at":      None,
        "estimated_delivery": "2025-06-22",
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    None,
        "cancellable":        False,
        "address_changeable": True,
        "damage_claim_active": False,
        "fin_note": (
            "The shipping address for this order can still be changed as it has not yet "
            "been dispatched. Direct the customer to email support@nestkart.com with their "
            "order number to request an address change."
        ),
    },
    "ORD-10085": {
        "order_id":           "ORD-10085",
        "customer_id":        "cust_004",
        "item_name":          "Ridgeline Bookshelf, Walnut",
        "qty":                1,
        "price_total":        "$215.00",
        "status":             "processing",
        "placed_at":          "2025-06-17T13:55:00-05:00",
        "dispatched_at":      None,
        "estimated_delivery": None,
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$17.99",
        "carrier":            "UPS",
        "tracking_number":    None,
        "cancellable":        True,
        "address_changeable": True,
        "damage_claim_active": False,
        "fin_note": (
            "This order is shipping to Alaska. Standard AK surcharge of $12.00 has been "
            "applied (base $5.99 + $12.00 = $17.99). Express shipping is not available for "
            "AK/HI. Large item surcharge (+$75) does not apply as this item ships standard freight."
        ),
    },
    "ORD-10096": {
        "order_id":           "ORD-10096",
        "customer_id":        "cust_005",
        "item_name":          "Custom Linen Sofa — Sage (made to order)",
        "qty":                1,
        "price_total":        "$1299.00",
        "status":             "in_production",
        "placed_at":          "2025-05-20T11:00:00-05:00",
        "dispatched_at":      None,
        "estimated_delivery": "2025-06-24",
        "delivered_at":       None,
        "shipping_method":    "large_item",
        "shipping_cost":      "$49.99",
        "carrier":            None,
        "tracking_number":    None,
        "cancellable":        False,
        "address_changeable": True,
        "damage_claim_active": False,
        "fin_note": (
            "This is a made-to-order item. The 24-hour cancellation window has elapsed — "
            "this order cannot be cancelled. Made-to-order items are not eligible for return "
            "unless defective. Do not confirm cancellation or return eligibility without "
            "escalating to an agent."
        ),
    },
    "ORD-10107": {
        "order_id":           "ORD-10107",
        "customer_id":        "cust_005",
        "item_name":          "Marble & Brass Side Table",
        "qty":                1,
        "price_total":        "$189.00",
        "status":             "delivered",
        "placed_at":          "2025-04-01T10:00:00-05:00",
        "dispatched_at":      "2025-04-02T09:00:00-05:00",
        "estimated_delivery": "2025-04-07",
        "delivered_at":       "2025-04-08",
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456789",
        "cancellable":        False,
        "address_changeable": False,
        "damage_claim_active": False,
        "fin_note": (
            "Return window expired. Standard 30-day return window from delivery (2025-04-08) "
            "expired on 2025-05-08. Any return request for this order requires agent exception approval."
        ),
    },
    "ORD-10118": {
        "order_id":           "ORD-10118",
        "customer_id":        "cust_002",
        "item_name":          "Cast Iron Dutch Oven (5.5L) — Verde Kitchen",
        "qty":                1,
        "price_total":        "$149.00",
        "status":             "delivered",
        "placed_at":          "2025-06-01T09:15:00-05:00",
        "dispatched_at":      "2025-06-02T08:00:00-05:00",
        "estimated_delivery": "2025-06-05",
        "delivered_at":       "2025-06-05",
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456790",
        "cancellable":        False,
        "address_changeable": False,
        "damage_claim_active": True,
        "fin_note": (
            "Active damage claim on this order. Customer reported cracked enamel coating "
            "on 2025-06-06 (within 48-hour window) with photos submitted. Claim status: "
            "under_review. Do not offer refund autonomously — escalate to Returns Team."
        ),
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — RETURNS
# ─────────────────────────────────────────────────────────────────────────────
RETURNS = {
    "RET-2201": {
        "return_id":              "RET-2201",
        "order_id":               "ORD-10041",
        "customer_id":            "cust_001",
        "item_name":              "Harlow Sofa (3-seater), Oatmeal",
        "reason":                 "item_not_as_described",
        "status":                 "return_received",
        "return_initiated":       "2025-05-25",
        "return_received_date":   "2025-05-30",
        "refund_status":          "processing",
        "refund_amount":          "$849.00",
        "refund_includes_shipping": True,
        "refund_estimated_date":  "2025-06-06",
        "refund_issued_date":     None,
        "refund_method":          "original_payment_method",
        "return_shipping":        "free",
        "requires_agent_escalation": True,
        "escalation_reason":      "refund_overdue",
        "fin_note": (
            "OVERDUE: Refund was estimated by 2025-06-06 but has not been issued. "
            "Escalate to Billing Team immediately."
        ),
    },
    "RET-2202": {
        "return_id":              "RET-2202",
        "order_id":               "ORD-10052",
        "customer_id":            "cust_001",
        "item_name":              "Soy Wax Candle — Cedarwood & Amber (one unit)",
        "reason":                 "change_of_mind",
        "status":                 "return_requested",
        "return_initiated":       "2025-06-16",
        "return_received_date":   None,
        "refund_status":          "pending",
        "refund_amount":          None,
        "refund_includes_shipping": False,
        "refund_estimated_date":  None,
        "refund_issued_date":     None,
        "refund_method":          "original_payment_method",
        "return_shipping":        "$8.00 estimated",
        "fin_note": (
            "INELIGIBLE — opened candles are not returnable under NestKart policy. "
            "This return_requested status is an error state from a prematurely submitted "
            "request. Fin must inform the customer that opened candles cannot be returned "
            "and escalate to an agent to close this return request."
        ),
    },
    "RET-2203": {
        "return_id":              "RET-2203",
        "order_id":               "ORD-10118",
        "customer_id":            "cust_002",
        "item_name":              "Cast Iron Dutch Oven (5.5L) — Verde Kitchen",
        "reason":                 "damaged_on_arrival",
        "status":                 "under_review",
        "return_initiated":       "2025-06-06",
        "return_received_date":   None,
        "refund_status":          "pending",
        "refund_amount":          "$149.00",
        "refund_includes_shipping": True,
        "refund_estimated_date":  None,
        "refund_issued_date":     None,
        "refund_method":          "original_payment_method",
        "return_shipping":        "free",
        "refund_locked":          True,
        "refund_locked_reason":   "damage_claim_under_review",
        "fin_note": (
            "Damage claim under review by Returns Team. Photos received. "
            "Do not confirm refund amount or timeline to customer until review is complete. "
            "Escalate if customer is pressing for resolution — this exceeds Fin's autonomous "
            "refund authority as the claim is unverified."
        ),
    },
}

# In-memory store for returns created at runtime via POST /api/orders/<id>/returns
DYNAMIC_RETURNS  = {}
_return_id_counter = [2204]  # mutable list so nested functions can increment it


# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — PRODUCTS
# ─────────────────────────────────────────────────────────────────────────────
WAITLIST_SIGNUPS = {
    "prod_002": ["cust_003"]  # Lisa Tran already on Elm Dining Table waitlist
}

PRODUCTS = {
    "prod_001": {
        "product_id":             "prod_001",
        "name":                   "Harlow Sofa (3-seater), Oatmeal",
        "brand":                  "Haven & Hearth",
        "price":                  "$849.00",
        "in_stock":               True,
        "stock_qty":              4,
        "made_to_order":          False,
        "lead_time_weeks":        None,
        "ships_assembled":        False,
        "ships_flat_pack":        True,
        "assembly_time_minutes":  45,
        "dimensions":             "W 220 cm × D 90 cm × H 85 cm",
        "weight_kg":              None,
        "warranty_years":         2,
        "warranty_type":          "manufacturer",
        "warranty_note":          None,
        "restock_eta":            None,
        "waitlist_open":          False,
        "waitlist_count":         None,
        "fin_note":               None,
    },
    "prod_002": {
        "product_id":             "prod_002",
        "name":                   "Elm Dining Table",
        "brand":                  "Forma Naturale",
        "price":                  "$429.00",
        "in_stock":               False,
        "stock_qty":              0,
        "made_to_order":          False,
        "lead_time_weeks":        None,
        "ships_assembled":        False,
        "ships_flat_pack":        True,
        "assembly_time_minutes":  60,
        "dimensions":             "W 160 cm × D 80 cm × H 75 cm",
        "weight_kg":              None,
        "warranty_years":         1,
        "warranty_type":          "manufacturer",
        "warranty_note":          None,
        "restock_eta":            "2025-07-14",
        "waitlist_open":          True,
        "waitlist_count":         23,
        "fin_note":               None,
    },
    "prod_003": {
        "product_id":             "prod_003",
        "name":                   "Cast Iron Dutch Oven (5.5L)",
        "brand":                  "Verde Kitchen",
        "price":                  "$149.00",
        "in_stock":               True,
        "stock_qty":              11,
        "made_to_order":          False,
        "lead_time_weeks":        None,
        "ships_assembled":        True,
        "ships_flat_pack":        False,
        "assembly_time_minutes":  None,
        "dimensions":             "diameter 28 cm × H 16 cm",
        "weight_kg":              5.8,
        "warranty_years":         None,
        "warranty_type":          "lifetime",
        "warranty_note":          "Lifetime warranty against manufacturing defects (Verde Kitchen).",
        "restock_eta":            None,
        "waitlist_open":          False,
        "waitlist_count":         None,
        "fin_note": (
            "This product carries a lifetime warranty against manufacturing defects. "
            "Claims via support@nestkart.com."
        ),
    },
    "prod_004": {
        "product_id":             "prod_004",
        "name":                   "Custom Linen Sofa (made to order)",
        "brand":                  "Haven & Hearth",
        "price":                  "$1299.00",
        "in_stock":               False,
        "stock_qty":              0,
        "made_to_order":          True,
        "lead_time_weeks":        5,
        "ships_assembled":        False,
        "ships_flat_pack":        True,
        "assembly_time_minutes":  60,
        "dimensions":             "W 240 cm × D 95 cm × H 88 cm",
        "weight_kg":              None,
        "warranty_years":         2,
        "warranty_type":          "manufacturer",
        "warranty_note":          None,
        "restock_eta":            None,
        "waitlist_open":          False,
        "waitlist_count":         None,
        "fin_note": (
            "This item is not returnable unless defective. "
            "Cancellation is only available within 24 hours of order placement."
        ),
    },
    "prod_005": {
        "product_id":             "prod_005",
        "name":                   "Ridgeline Bookshelf, Walnut",
        "brand":                  "Forma Naturale",
        "price":                  "$215.00",
        "in_stock":               True,
        "stock_qty":              7,
        "made_to_order":          False,
        "lead_time_weeks":        None,
        "ships_assembled":        False,
        "ships_flat_pack":        True,
        "assembly_time_minutes":  30,
        "dimensions":             "W 90 cm × D 35 cm × H 180 cm",
        "weight_kg":              22.0,
        "warranty_years":         1,
        "warranty_type":          "manufacturer",
        "warranty_note":          None,
        "restock_eta":            None,
        "waitlist_open":          False,
        "waitlist_count":         None,
        "fin_note":               None,
    },
    "prod_006": {
        "product_id":             "prod_006",
        "name":                   "Marble & Brass Side Table",
        "brand":                  "Atelier South",
        "price":                  "$189.00",
        "in_stock":               True,
        "stock_qty":              3,
        "made_to_order":          False,
        "lead_time_weeks":        None,
        "ships_assembled":        True,
        "ships_flat_pack":        False,
        "assembly_time_minutes":  None,
        "dimensions":             "W 45 cm × D 45 cm × H 55 cm",
        "weight_kg":              8.4,
        "warranty_years":         1,
        "warranty_type":          "manufacturer",
        "warranty_note":          None,
        "restock_eta":            None,
        "waitlist_open":          False,
        "waitlist_count":         None,
        "fin_note":               None,
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — ADDRESSES  (full details — only summary exposed on /customers/<id>)
# ─────────────────────────────────────────────────────────────────────────────
ADDRESSES = {
    "cust_001": [
        {"address_id": "addr_001", "label": "Home",   "street": "142 Maple Drive",      "city": "Brooklyn",      "state": "NY", "zip": "11201", "is_default": True},
        {"address_id": "addr_002", "label": "Office", "street": "30 Hudson Yards",       "city": "New York",      "state": "NY", "zip": "10001", "is_default": False},
    ],
    "cust_002": [
        {"address_id": "addr_003", "label": "Home",   "street": "88 Ocean Ave",          "city": "Santa Monica",  "state": "CA", "zip": "90402", "is_default": True},
    ],
    "cust_003": [
        {"address_id": "addr_004", "label": "Home",    "street": "4712 Bluebonnet Blvd", "city": "Austin",        "state": "TX", "zip": "78759", "is_default": True},
        {"address_id": "addr_005", "label": "Parents", "street": "210 Oak Street",        "city": "Dallas",        "state": "TX", "zip": "75201", "is_default": False},
    ],
    "cust_004": [
        {"address_id": "addr_006", "label": "Home",   "street": "317 Caribou Lane",      "city": "Anchorage",     "state": "AK", "zip": "99501", "is_default": True},
    ],
    "cust_005": [
        {"address_id": "addr_007", "label": "Home",   "street": "520 Valencia Street",   "city": "San Francisco", "state": "CA", "zip": "94110", "is_default": True},
        {"address_id": "addr_008", "label": "Studio", "street": "1200 Market Street",    "city": "San Francisco", "state": "CA", "zip": "94102", "is_default": False},
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — PAYMENT METHODS  (last four only — never expose full card numbers)
# ─────────────────────────────────────────────────────────────────────────────
PAYMENT_METHODS = {
    "cust_001": {"type": "Visa",       "last_four": "4242", "expiry_month": "09", "expiry_year": "2027", "is_expired": False},
    "cust_002": {"type": "Mastercard", "last_four": "5555", "expiry_month": "03", "expiry_year": "2026", "is_expired": False},
    "cust_003": {"type": "Amex",       "last_four": "0005", "expiry_month": "11", "expiry_year": "2025", "is_expired": False},
    "cust_004": {"type": "Visa",       "last_four": "1234", "expiry_month": "07", "expiry_year": "2026", "is_expired": False},
    "cust_005": {"type": "Mastercard", "last_four": "8888", "expiry_month": "01", "expiry_year": "2024", "is_expired": True},
}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def err(error_code, message, status=400):
    """Return a standardised error JSON response."""
    return jsonify({"ok": False, "error": error_code, "message": message}), status


def ownership_error(provided_customer_id, actual_customer_id):
    """
    Return a 403 ownership-mismatch error if provided_customer_id does not match
    actual_customer_id (the verified owner of the order/return/account being acted on).
    Returns None if ownership checks out — caller should proceed.
    Used by all mutating endpoints (cancel, address update, initiate-return, replacement)
    to stop Fin from actioning one customer's order/return using another customer's ID.
    """
    if provided_customer_id != actual_customer_id:
        return jsonify({
            "ok":      False,
            "error":   "ownership_mismatch",
            "message": (
                "The provided customer_id does not match the verified owner of this "
                "order/return. Re-verify the customer's identity before retrying."
            ),
            "fin_note": (
                "Do not retry this call with a different customer_id to work around this "
                "error. This usually means Fin is acting on the wrong customer's record — "
                "re-confirm which customer and which order/return are actually involved."
            ),
        }), 403
    return None


def add_business_days(start_date, days):
    """Add N business days (Mon–Fri) to start_date and return the resulting date."""
    current = start_date
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5:   # 0=Mon … 4=Fri
            added += 1
    return current


def tracking_url(tracking_number):
    if tracking_number:
        return f"https://track.nestkart.com/{tracking_number}"
    return None


def parse_price(price_str):
    """Parse a '$849.00' style string into a float. Returns None if unparseable."""
    if not price_str:
        return None
    try:
        return float(price_str.replace("$", "").replace(",", ""))
    except (ValueError, AttributeError):
        return None


REPLACEMENT_AUTONOMOUS_LIMIT_USD = 300.00


def _return_eligibility(order_id):
    """
    Return a dict with eligibility details for each hardcoded order.
    Used by both B1 (GET return-eligibility) and B2 (POST returns).
    """
    if order_id == "ORD-10041":
        return {
            "eligible": False,
            "reason": (
                "Return window has expired. The Harlow Sofa is furniture over $300, "
                "subject to a 14-day return window from delivery (2025-05-18). "
                "That window expired on 2025-06-01."
            ),
            "return_window_days":       14,
            "return_window_expires_on": "2025-06-01",
            "days_remaining":           0,
            "return_shipping_cost":     "free (defect/description-mismatch basis only)",
            "item_condition_requirements": (
                "Unused, in original packaging. "
                "Flat-pack furniture must not have been assembled."
            ),
            "fin_note": (
                "Return window has expired. Furniture over $300 has a 14-day return window "
                "which elapsed on 2025-06-01. Agent exception required to process any return."
            ),
        }

    if order_id == "ORD-10052":
        return {
            "eligible": False,
            "reason": (
                "Order has not yet been delivered. Additionally, opened candles are not "
                "eligible for return under NestKart policy regardless of delivery status."
            ),
            "return_window_days":       30,
            "return_window_expires_on": None,
            "days_remaining":           None,
            "return_shipping_cost":     "$8.00 estimated (customer pays — change of mind)",
            "item_condition_requirements": (
                "Item must be unused and in original packaging. "
                "Opened candles are non-returnable."
            ),
            "fin_note": (
                "This order has not yet been delivered — a return cannot be initiated until "
                "delivery is confirmed. Also note: opened candles are categorically "
                "non-returnable under NestKart policy. Do not promise a return on this item."
            ),
        }

    if order_id == "ORD-10063":
        return {
            "eligible": False,
            "reason": (
                "Order has not yet been delivered. "
                "Return can only be initiated after confirmed delivery."
            ),
            "return_window_days":       14,
            "return_window_expires_on": None,
            "days_remaining":           None,
            "return_shipping_cost":     "$30.00–$60.00 estimated (customer pays — change of mind); free if defective/damaged",
            "item_condition_requirements": (
                "Unused, in original packaging. "
                "Flat-pack furniture must not have been assembled."
            ),
            "fin_note": (
                "Order has not yet been delivered. Return eligibility cannot be confirmed "
                "until delivery is complete. Note: Elm Dining Table is furniture over $300, "
                "so a 14-day return window will apply once delivered."
            ),
        }

    if order_id == "ORD-10074":
        return {
            "eligible": False,
            "reason": "Order is still processing and has not yet been delivered.",
            "return_window_days":       30,
            "return_window_expires_on": None,
            "days_remaining":           None,
            "return_shipping_cost":     "$8.00–$15.00 estimated (customer pays — change of mind); free if defective",
            "item_condition_requirements": "Unused, in original packaging.",
            "fin_note": (
                "Order is in processing status and has not been dispatched. "
                "Return eligibility cannot be confirmed until delivery is complete."
            ),
        }

    if order_id == "ORD-10085":
        return {
            "eligible": False,
            "reason": "Order is still processing and has not yet been delivered.",
            "return_window_days":       30,
            "return_window_expires_on": None,
            "days_remaining":           None,
            "return_shipping_cost":     "$8.00–$15.00 estimated (customer pays — change of mind); free if defective",
            "item_condition_requirements": (
                "Unused, in original packaging. "
                "Flat-pack furniture must not have been assembled."
            ),
            "fin_note": (
                "Order is in processing status and has not been dispatched. "
                "Return eligibility cannot be confirmed. "
                "Note: this is an AK order — AK shipping surcharges apply on any reshipping."
            ),
        }

    if order_id == "ORD-10096":
        return {
            "eligible": False,
            "reason": (
                "This is a made-to-order item. "
                "Made-to-order items are not eligible for return unless defective."
            ),
            "return_window_days":       None,
            "return_window_expires_on": None,
            "days_remaining":           None,
            "return_shipping_cost":     "free (defective items only)",
            "item_condition_requirements": (
                "N/A — made-to-order items are non-returnable unless defective."
            ),
            "fin_note": (
                "Made-to-order items are not returnable unless defective. "
                "Do not confirm return eligibility without escalating to an agent. "
                "If the customer believes the item is defective, collect details and escalate."
            ),
        }

    if order_id == "ORD-10107":
        return {
            "eligible": False,
            "reason": (
                "Return window has expired. "
                "The 30-day standard return window from delivery (2025-04-08) expired on 2025-05-08."
            ),
            "return_window_days":       30,
            "return_window_expires_on": "2025-05-08",
            "days_remaining":           0,
            "return_shipping_cost":     "$8.00–$15.00 estimated (customer pays)",
            "item_condition_requirements": "Unused, in original packaging.",
            "fin_note": (
                "Return window expired. Standard 30-day return window from delivery "
                "(2025-04-08) expired on 2025-05-08. "
                "Any return request for this order requires agent exception approval."
            ),
        }

    if order_id == "ORD-10118":
        return {
            "eligible": True,
            "reason": (
                "Item was reported damaged on arrival within the 48-hour window. "
                "Active damage claim under review. Return shipping is covered by NestKart."
            ),
            "return_window_days":       30,
            "return_window_expires_on": "2025-07-05",
            "days_remaining":           None,
            "return_shipping_cost":     "free",
            "item_condition_requirements": (
                "Item must be in received condition (damaged state acceptable for damage claims). "
                "Original packaging preferred where available."
            ),
            "refund_locked":            True,
            "refund_locked_reason":     "damage_claim_under_review",
            "fin_note": (
                "Active damage claim under review (Claim ref: RET-2203). Photos received. "
                "Do not confirm refund amount or final timeline until the Returns Team "
                "completes their review. Escalate if customer requires immediate resolution."
            ),
        }

    # Fallback for unknown order_id (shouldn't be reached — caller validates first)
    return {
        "eligible": False,
        "reason": "Return eligibility could not be determined for this order.",
        "return_window_days":       None,
        "return_window_expires_on": None,
        "days_remaining":           None,
        "return_shipping_cost":     None,
        "item_condition_requirements": None,
        "fin_note": "Eligibility rules for this order are not defined. Escalate to support team.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# BEFORE_REQUEST — AUTHENTICATION
# ─────────────────────────────────────────────────────────────────────────────

@app.before_request
def check_auth():
    if request.path in NO_AUTH_PATHS:
        return  # exempt paths — no auth check

    api_key    = request.headers.get("X-Api-Key", "")
    auth_hdr   = request.headers.get("Authorization", "")
    bearer_tok = auth_hdr[len("Bearer "):] if auth_hdr.startswith("Bearer ") else ""

    if api_key == VALID_API_KEY or bearer_tok == VALID_BEARER:
        return  # authenticated

    return jsonify({
        "ok":      False,
        "error":   "unauthorized",
        "message": (
            "A valid X-Api-Key header or Authorization Bearer token is required. "
            "See the README block at the top of app.py for accepted values."
        ),
    }), 401


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    """No auth required — used by Railway to verify the service is up."""
    return jsonify({
        "ok":      True,
        "service": "NestKart Mock API",
        "version": "2.2.0",
        "status":  "healthy",
    })


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN A — ORDERS & TRACKING
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/orders/<order_id>", methods=["GET"])
def get_order(order_id):
    """
    A1 — Order status & details.
    Fin use-case: customer asks about order status, delivery date, or tracking.
    """
    order = ORDERS.get(order_id)
    if not order:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)

    t_number = order.get("tracking_number")
    t_url    = tracking_url(t_number)

    resp = {
        "ok":                True,
        "order_id":          order["order_id"],
        "customer_id":       order["customer_id"],
        "status":            order["status"],
        "item_name":         order["item_name"],
        "qty":               order["qty"],
        "price_total":       order["price_total"],
        "shipping_method":   order["shipping_method"],
        "shipping_cost":     order["shipping_cost"],
        "carrier":           order.get("carrier"),
        "tracking_number":   t_number,
        "tracking_url":      t_url,
        "tracking_url_note": "Mock URL — not a live carrier link." if t_url else None,
        "placed_at":         order["placed_at"],
        "dispatched_at":     order.get("dispatched_at"),
        "estimated_delivery":order.get("estimated_delivery"),
        "delivered_at":      order.get("delivered_at"),
        "cancellable":       order["cancellable"],
        "address_changeable":order["address_changeable"],
    }

    if order.get("damage_claim_active"):
        resp["damage_claim_active"] = True

    if order.get("fin_note"):
        resp["fin_note"] = order["fin_note"]

    return jsonify(resp)


@app.route("/api/customers/<customer_id>/orders", methods=["GET"])
def get_customer_orders(customer_id):
    """
    A2 — Customer order history.
    Fin use-case: customer asks "what are my orders?" or wants a summary.
    """
    if customer_id not in CUSTOMERS:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)

    orders = sorted(
        [o for o in ORDERS.values() if o["customer_id"] == customer_id],
        key=lambda o: o["placed_at"],
        reverse=True,
    )

    return jsonify({
        "ok":           True,
        "customer_id":  customer_id,
        "total_orders": len(orders),
        "orders": [
            {
                "order_id":          o["order_id"],
                "status":            o["status"],
                "item_summary":      o["item_name"],
                "placed_at":         o["placed_at"],
                "estimated_delivery":o.get("estimated_delivery"),
                "price_total":       o["price_total"],
            }
            for o in orders
        ],
    })


@app.route("/api/orders/<order_id>/cancel", methods=["POST"])
def cancel_order(order_id):
    """
    A3 — Cancel an order.
    Fin use-case: customer requests cancellation.
    Requires customer_id to match the order's actual owner (403 ownership_mismatch otherwise).
    Body: { "customer_id": "cust_xxx", "reason": "<accepted_reason>" }
    """
    order = ORDERS.get(order_id)
    if not order:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)

    body        = request.get_json(silent=True) or {}
    customer_id = body.get("customer_id")
    reason      = body.get("reason")

    if not customer_id:
        return err("missing_field", "Required field 'customer_id' is missing.", 400)

    ownership_err = ownership_error(customer_id, order["customer_id"])
    if ownership_err:
        return ownership_err

    ACCEPTED_CANCEL_REASONS = [
        "changed_my_mind",
        "ordered_by_mistake",
        "found_better_price",
        "delivery_too_slow",
        "other",
    ]

    if not reason:
        return err("missing_field", "Required field 'reason' is missing.", 400)
    if reason not in ACCEPTED_CANCEL_REASONS:
        return err(
            "invalid_reason",
            f"Invalid reason '{reason}'. Accepted values: {', '.join(ACCEPTED_CANCEL_REASONS)}.",
            400,
        )

    if not order["cancellable"]:
        status = order["status"]
        if status == "delivered":
            cancel_error = "order_already_delivered"
        elif status in ("dispatched", "in_transit"):
            cancel_error = "order_already_dispatched"
        elif status == "in_production":
            cancel_error = "made_to_order_cancellation_window_elapsed"
        else:
            cancel_error = "order_not_cancellable"

        return jsonify({
            "ok":        False,
            "cancelled": False,
            "reason":    cancel_error,
            "fin_note": (
                "Inform the customer that their order cannot be cancelled. "
                "If the order has already been dispatched, they may return it within the "
                "applicable return window after delivery. "
                "If this is a made-to-order item, the 24-hour cancellation window has elapsed — "
                "escalate to an agent."
            ),
        }), 200

    return jsonify({
        "ok":              True,
        "cancelled":       True,
        "order_id":        order_id,
        "refund_method":   "original_payment_method",
        "refund_timeline": (
            "5–7 business days to your original payment method, "
            "plus 2–5 business days for your bank to process."
        ),
    })


@app.route("/api/orders/<order_id>/address-change-eligibility", methods=["GET"])
def address_change_eligibility(order_id):
    """
    A5 — Address change eligibility.
    Fin use-case: check before offering or executing an address change.
    Returns eligibility, masked current address, and AK/HI surcharge warning.
    """
    order = ORDERS.get(order_id)
    if not order:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)

    # Hardcoded masked addresses per eligible order; fallback for all others
    _masked = {
        "ORD-10074": {"city": "Austin",       "state": "TX", "zip": "78759"},
        "ORD-10085": {"city": "Anchorage",    "state": "AK", "zip": "99501"},
        "ORD-10096": {"city": "San Francisco","state": "CA", "zip": "94110"},
    }
    masked = _masked.get(order_id, {"city": "Brooklyn", "state": "NY", "zip": "11201"})

    eligible = order["address_changeable"]

    surcharge_may_apply = masked["state"] in ("AK", "HI")
    surcharge_note = (
        "Changing to AK or HI incurs a $12.00 standard or $75.00 large-item surcharge."
        if surcharge_may_apply else None
    )

    if eligible:
        fin_note = (
            "The shipping address for this order can still be changed — it has not yet been "
            "picked up by the carrier. Confirm the new address with the customer, then call "
            "POST /api/orders/<order_id>/address to update it."
        )
    else:
        fin_note = (
            "The shipping address for this order can no longer be changed — the order has "
            "already been picked up by the carrier. Inform the customer and advise them to "
            "contact the carrier directly if they need to redirect the parcel."
        )

    resp = {
        "ok":                       True,
        "order_id":                 order_id,
        "address_change_eligible":  eligible,
        "current_shipping_address": masked,
    }

    if not eligible:
        resp["reason"] = "Order has already been picked up by the carrier and can no longer be redirected."

    if surcharge_may_apply:
        resp["surcharge_may_apply"] = True
        resp["surcharge_note"]      = surcharge_note

    resp["fin_note"] = fin_note

    return jsonify(resp)


@app.route("/api/orders/<order_id>/address", methods=["POST"])
def update_delivery_address(order_id):
    """
    A6 — Update delivery address.
    Fin use-case: execute address change after A5 confirmed eligibility.
    Requires customer_id to match the order's actual owner (403 ownership_mismatch otherwise).
    Body: { "customer_id": "cust_xxx", "new_address": { "line1", "city", "state", "zip", ... } }
    """
    order = ORDERS.get(order_id)
    if not order:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)

    body         = request.get_json(silent=True) or {}
    customer_id  = body.get("customer_id")
    new_address  = body.get("new_address") or {}

    # Validate required fields
    if not customer_id:
        return err("missing_field", "Required field 'customer_id' is missing.", 400)
    if not new_address.get("line1") or not new_address.get("city") \
            or not new_address.get("state") or not new_address.get("zip"):
        return err(
            "missing_field",
            "Required fields missing in 'new_address': line1, city, state, zip are all required.",
            400,
        )

    ownership_err = ownership_error(customer_id, order["customer_id"])
    if ownership_err:
        return ownership_err

    if not order["address_changeable"]:
        return jsonify({
            "ok":              False,
            "address_updated": False,
            "reason":          "order_already_dispatched",
            "fin_note": (
                "The order has already been dispatched and the address can no longer be changed. "
                "Inform the customer and advise them to contact the carrier to redirect the parcel."
            ),
        }), 200

    # Surcharge calculation
    new_state       = new_address.get("state", "")
    shipping_method = order.get("shipping_method", "")
    if new_state in ("AK", "HI"):
        surcharge = 75.00 if shipping_method == "large_item" else 12.00
    else:
        surcharge = 0.00

    # Look up customer email
    cust = CUSTOMERS.get(customer_id, {})
    confirmation_email = cust.get("email")

    return jsonify({
        "ok":                       True,
        "address_updated":          True,
        "order_id":                 order_id,
        "new_shipping_address":     new_address,
        "surcharge_applied_usd":    surcharge,
        "confirmation_email_sent_to": confirmation_email,
        "updated_at":               "2025-06-19T12:00:00Z",
        "fin_note": (
            "Address has been updated. Confirmation email sent to customer. "
            "Read the new address back to the customer to confirm."
        ),
    })


@app.route("/api/orders/<order_id>/non-delivery-investigation", methods=["POST"])
def non_delivery_investigation(order_id):
    """
    A7 — Non-delivery investigation.
    Fin use-case: open a carrier investigation when a customer reports a delivered
    order not received.
    Body: { "customer_id": "cust_xxx", "reported_issue": "parcel_not_received" }
    """
    order = ORDERS.get(order_id)
    if not order:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)

    if order["status"] != "delivered":
        return jsonify({
            "ok":                  False,
            "investigation_opened": False,
            "reason":              "order_not_yet_delivered",
            "fin_note": (
                "Carrier investigations can only be opened for orders with status 'delivered'. "
                "Inform the customer the order is still in transit."
            ),
        }), 200

    investigation_id = "INV-" + order_id[-5:]

    return jsonify({
        "ok":                    True,
        "investigation_opened":  True,
        "investigation_id":      investigation_id,
        "order_id":              order_id,
        "carrier":               order.get("carrier"),
        "estimated_resolution_days": 3,
        "fin_note": (
            "Investigation opened with carrier. Inform the customer we are investigating "
            "and will follow up within 3 business days. Do not promise a refund or "
            "replacement at this stage."
        ),
    })


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN B — RETURNS & REFUNDS
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/orders/<order_id>/return-eligibility", methods=["GET"])
def return_eligibility(order_id):
    """
    B1 — Check return eligibility.
    Fin use-case: customer asks 'can I return this?'
    """
    if order_id not in ORDERS:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)

    elig = _return_eligibility(order_id)
    return jsonify({"ok": True, "order_id": order_id, **elig})


@app.route("/api/orders/<order_id>/returns", methods=["POST"])
def initiate_return(order_id):
    """
    B2 — Initiate a return.
    Fin use-case: customer wants to start a return after Fin has verified eligibility.
    Requires customer_id to match the order's actual owner (403 ownership_mismatch otherwise).
    Body: {
      "customer_id": "cust_xxx",
      "reason": "<accepted_reason>",
      "condition": "<accepted_condition>",
      "has_original_packaging": true|false
    }
    """
    if order_id not in ORDERS:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)

    order = ORDERS[order_id]
    body  = request.get_json(silent=True) or {}

    customer_id          = body.get("customer_id")
    reason               = body.get("reason")
    condition            = body.get("condition")
    has_original_pkg     = body.get("has_original_packaging")

    ACCEPTED_RETURN_REASONS = [
        "change_of_mind",
        "item_not_as_described",
        "damaged_on_arrival",
        "defective",
        "wrong_item_received",
    ]
    ACCEPTED_CONDITIONS = ["unused", "opened", "assembled"]

    # Validate required fields
    missing = [f for f, v in [
        ("customer_id", customer_id),
        ("reason", reason),
        ("condition", condition),
    ] if v is None]
    if has_original_pkg is None:
        missing.append("has_original_packaging")
    if missing:
        return err("missing_field", f"Required field(s) missing: {', '.join(missing)}.", 400)
    if reason not in ACCEPTED_RETURN_REASONS:
        return err("invalid_reason", f"Invalid reason '{reason}'. Accepted: {', '.join(ACCEPTED_RETURN_REASONS)}.", 400)
    if condition not in ACCEPTED_CONDITIONS:
        return err("invalid_condition", f"Invalid condition '{condition}'. Accepted: {', '.join(ACCEPTED_CONDITIONS)}.", 400)

    ownership_err = ownership_error(customer_id, order["customer_id"])
    if ownership_err:
        return ownership_err

    # Check eligibility
    elig = _return_eligibility(order_id)
    if not elig["eligible"]:
        return jsonify({
            "ok":       False,
            "eligible": False,
            "reason":   elig["reason"],
            "fin_note": elig.get("fin_note"),
        }), 200

    # Generate return ID and store in-memory
    return_id = f"RET-{_return_id_counter[0]}"
    _return_id_counter[0] += 1

    today            = date.today()
    refund_eta       = add_business_days(today, 7)
    free_return      = elig["return_shipping_cost"] == "free"
    incl_shipping    = reason in (
        "damaged_on_arrival", "defective", "wrong_item_received", "item_not_as_described"
    )

    DYNAMIC_RETURNS[return_id] = {
        "return_id":              return_id,
        "order_id":               order_id,
        "customer_id":            customer_id,
        "item_name":              order["item_name"],
        "reason":                 reason,
        "condition":              condition,
        "has_original_packaging": has_original_pkg,
        "status":                 "return_requested",
        "return_initiated":       today.isoformat(),
        "return_received_date":   None,
        "refund_status":          "pending",
        "refund_amount":          None,
        "refund_includes_shipping": incl_shipping,
        "refund_estimated_date":  refund_eta.isoformat(),
        "refund_issued_date":     None,
        "refund_method":          "original_payment_method",
        "return_shipping":        "free" if free_return else elig["return_shipping_cost"],
        "fin_note":               None,
    }

    resp = {
        "ok":                  True,
        "return_id":           return_id,
        "status":              "return_requested",
        "instructions": (
            "Please repack the item securely in its original packaging and attach the "
            "return label to the outside of the box. Drop it off at any UPS location "
            "within 14 days."
        ),
        "return_shipping_cost":  "free" if free_return else elig["return_shipping_cost"],
        "estimated_refund_date": refund_eta.isoformat(),
        "refund_bank_note": (
            "Once NestKart processes your refund, allow an additional 2–5 business days "
            "for your bank to post the funds."
        ),
    }
    if free_return:
        resp["return_shipping_label_url"] = f"https://returns.nestkart.com/label/{return_id}"

    return jsonify(resp)


@app.route("/api/returns/<return_id>", methods=["GET"])
def get_return(return_id):
    """
    B3 — Return & refund status.
    Fin use-case: customer asks about the status of a specific return or refund.
    """
    ret = RETURNS.get(return_id) or DYNAMIC_RETURNS.get(return_id)
    if not ret:
        return err("return_not_found", f"No return found with ID '{return_id}'.", 404)

    resp = {
        "ok":                     True,
        "return_id":              ret["return_id"],
        "order_id":               ret["order_id"],
        "item_name":              ret["item_name"],
        "reason":                 ret["reason"],
        "status":                 ret["status"],
        "return_initiated":       ret["return_initiated"],
        "return_received_date":   ret.get("return_received_date"),
        "refund_status":          ret["refund_status"],
        "refund_amount":          ret.get("refund_amount"),
        "refund_includes_shipping": ret.get("refund_includes_shipping"),
        "refund_method":          ret["refund_method"],
        "refund_estimated_date":  ret.get("refund_estimated_date"),
        "refund_issued_date":     ret.get("refund_issued_date"),
    }

    if ret.get("refund_locked"):
        resp["refund_locked"] = True
        resp["refund_locked_reason"] = ret.get("refund_locked_reason")

    if ret.get("requires_agent_escalation"):
        resp["requires_agent_escalation"] = True
        resp["escalation_reason"] = ret.get("escalation_reason")

    if ret.get("fin_note"):
        resp["fin_note"] = ret["fin_note"]

    return jsonify(resp)


@app.route("/api/customers/<customer_id>/returns", methods=["GET"])
def get_customer_returns(customer_id):
    """
    B4 — All returns for a customer.
    Fin use-case: customer asks 'do I have any open returns?'
    """
    if customer_id not in CUSTOMERS:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)

    all_rets = list(RETURNS.values()) + list(DYNAMIC_RETURNS.values())
    cust_rets = [r for r in all_rets if r.get("customer_id") == customer_id]

    return jsonify({
        "ok":            True,
        "customer_id":   customer_id,
        "total_returns": len(cust_rets),
        "returns": [
            {
                "return_id":            r["return_id"],
                "order_id":             r["order_id"],
                "item_name":            r["item_name"],
                "status":               r["status"],
                "refund_status":        r["refund_status"],
                "return_initiated":     r["return_initiated"],
                "refund_estimated_date":r.get("refund_estimated_date"),
            }
            for r in cust_rets
        ],
    })


@app.route("/api/returns/<return_id>/replacement", methods=["POST"])
def issue_replacement(return_id):
    """
    B5 — Issue replacement order.
    Fin use-case: create a replacement for a damaged or incorrect item.
    Autonomous replacement is server-enforced under $300 order value (see
    REPLACEMENT_AUTONOMOUS_LIMIT_USD) and blocked while status == "under_review".
    Requires customer_id to match the return's actual owner (403 ownership_mismatch otherwise).
    Body: { "customer_id": "cust_xxx", "reason": "<accepted_reason>" }
    """
    ret = RETURNS.get(return_id) or DYNAMIC_RETURNS.get(return_id)
    if not ret:
        return err("return_not_found", f"No return found with ID '{return_id}'.", 404)

    body        = request.get_json(silent=True) or {}
    customer_id = body.get("customer_id")
    reason      = body.get("reason")

    if not customer_id or not reason:
        missing = [f for f, v in [("customer_id", customer_id), ("reason", reason)] if not v]
        return err("missing_field", f"Required field(s) missing: {', '.join(missing)}.", 400)

    ACCEPTED_REPLACEMENT_REASONS = [
        "damaged_on_arrival",
        "incorrect_item_received",
        "item_not_as_described",
    ]
    if reason not in ACCEPTED_REPLACEMENT_REASONS:
        return err(
            "invalid_reason",
            f"Invalid reason '{reason}'. Accepted values: {', '.join(ACCEPTED_REPLACEMENT_REASONS)}.",
            400,
        )

    ownership_err = ownership_error(customer_id, ret["customer_id"])
    if ownership_err:
        return ownership_err

    if ret["status"] == "under_review":
        return jsonify({
            "ok":                  False,
            "replacement_issued":  False,
            "reason":              "claim_under_review",
            "fin_note": (
                "This return is currently under review by the Returns Team. A replacement "
                "cannot be issued until the review is complete. Do not promise a replacement "
                "— escalate if the customer needs urgent resolution."
            ),
        }), 200

    # Autonomous replacement is only permitted under the order value threshold.
    # Above this, Fin must escalate to an agent rather than self-issue a replacement.
    original_order = ORDERS.get(ret["order_id"], {})
    order_value = parse_price(original_order.get("price_total"))
    if order_value is not None and order_value >= REPLACEMENT_AUTONOMOUS_LIMIT_USD:
        return jsonify({
            "ok":                       False,
            "replacement_issued":       False,
            "reason":                   "exceeds_autonomous_replacement_limit",
            "order_value_usd":          order_value,
            "autonomous_limit_usd":     REPLACEMENT_AUTONOMOUS_LIMIT_USD,
            "requires_agent_escalation": True,
            "fin_note": (
                f"This item's value (${order_value:.2f}) exceeds Fin's autonomous replacement "
                f"limit of ${REPLACEMENT_AUTONOMOUS_LIMIT_USD:.2f}. Do not issue a replacement "
                "yourself — escalate to an agent for approval, while keeping the customer "
                "informed that their claim is being reviewed."
            ),
        }), 200

    replacement_order_id = "ORD-REPL-" + return_id

    return jsonify({
        "ok":                     True,
        "replacement_issued":     True,
        "replacement_order_id":   replacement_order_id,
        "return_id":              return_id,
        "item_name":              ret["item_name"],
        "estimated_dispatch_days": 2,
        "fin_note": (
            "Replacement order created. Inform the customer their replacement will be "
            "dispatched within 2 business days and they will receive a shipping "
            "confirmation email."
        ),
    })


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN C — ACCOUNT & PROFILE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/customers/<customer_id>", methods=["GET"])
def get_customer(customer_id):
    """
    C1 — Customer profile.
    Fin use-case: identity confirmation, account enquiries, deletion requests.
    Returns address summary only (no street detail); use /addresses for full detail.
    """
    cust = CUSTOMERS.get(customer_id)
    if not cust:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)

    addrs   = ADDRESSES.get(customer_id, [])
    payment = PAYMENT_METHODS.get(customer_id)
    ak_hi   = cust["state"] in ("AK", "HI")

    fin_notes = []
    if ak_hi:
        fin_notes.append(
            "This customer is in AK/HI. Standard shipping surcharge +$12 applies. "
            "Large item surcharge +$75 applies. Express shipping is not available for AK/HI."
        )
    if payment and payment["is_expired"]:
        fin_notes.append(
            "Customer's saved payment method is expired. "
            "Flag this if they are placing or modifying an order."
        )

    resp = {
        "ok":               True,
        "customer_id":      cust["customer_id"],
        "name":             cust["name"],
        "email":            cust["email"],
        "account_created":  cust["account_created"],
        "marketing_opt_in": cust["marketing_opt_in"],
        "state":            cust["state"],
        "ak_hi_customer":   ak_hi,
        "saved_addresses": [
            {
                "address_id": a["address_id"],
                "label":      a["label"],
                "is_default": a["is_default"],
            }
            for a in addrs
        ],
        "payment_method": {
            "type":         payment["type"],
            "last_four":    payment["last_four"],
            "expiry_month": payment["expiry_month"],
            "expiry_year":  payment["expiry_year"],
            "is_expired":   payment["is_expired"],
        } if payment else None,
        "account_deletion_policy": (
            "Your personal data will be permanently deleted within 30 days of your "
            "deletion request. Order records are retained for 7 years in accordance with "
            "legal and financial compliance requirements and cannot be deleted."
        ),
    }

    if fin_notes:
        resp["fin_note"] = " ".join(fin_notes)

    return jsonify(resp)


@app.route("/api/customers/<customer_id>/addresses", methods=["GET"])
def get_customer_addresses(customer_id):
    """
    C2 — Saved delivery addresses (full detail).
    Fin use-case: customer asks about saved addresses or wants to change delivery address.
    """
    if customer_id not in CUSTOMERS:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)

    addrs = ADDRESSES.get(customer_id, [])

    return jsonify({
        "ok":           True,
        "customer_id":  customer_id,
        "total_saved":  len(addrs),
        "max_allowed":  5,
        "addresses": [
            {
                "address_id":    a["address_id"],
                "label":         a["label"],
                "street":        a["street"],
                "city":          a["city"],
                "state":         a["state"],
                "zip":           a["zip"],
                "full_address":  f"{a['street']}, {a['city']}, {a['state']} {a['zip']}",
                "is_default":    a["is_default"],
            }
            for a in addrs
        ],
    })


@app.route("/api/customers/<customer_id>/account-deletion-preview", methods=["GET"])
def account_deletion_preview(customer_id):
    """
    C3 — Account deletion preview.
    Fin use-case: must call this before presenting account deletion to the customer.
    Returns full impact preview: open orders, pending refunds, data retained/deleted.
    """
    cust = CUSTOMERS.get(customer_id)
    if not cust:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)

    NON_OPEN_STATUSES = {"delivered", "cancelled"}
    open_orders = [
        o for o in ORDERS.values()
        if o["customer_id"] == customer_id and o["status"] not in NON_OPEN_STATUSES
    ]
    open_orders_count = len(open_orders)

    all_rets = list(RETURNS.values()) + list(DYNAMIC_RETURNS.values())
    pending_refunds_count = sum(
        1 for r in all_rets
        if r.get("customer_id") == customer_id and r.get("refund_status") == "processing"
    )

    open_orders_warning = (
        f"You have {open_orders_count} active order(s). Deleting your account will not cancel "
        f"them, but you may lose access to order tracking."
        if open_orders_count > 0 else None
    )

    return jsonify({
        "ok":                  True,
        "customer_id":         customer_id,
        "deletion_eligible":   True,
        "ineligibility_reason": None,
        "open_orders_count":   open_orders_count,
        "open_orders_warning": open_orders_warning,
        "pending_refunds_count": pending_refunds_count,
        "data_to_be_deleted": [
            "Profile information (name, email, marketing preferences)",
            "Saved addresses",
            "Saved payment methods",
            "Wishlist and product reviews",
        ],
        "data_retained_for_legal": [
            {
                "data_type":        "Order records and transaction history",
                "retention_period": "7 years (legal/tax obligation)",
            }
        ],
        "personal_data_deletion_timeline": (
            "Personal data will be permanently deleted within 30 days of account closure."
        ),
        "action_is_irreversible": True,
        "requires_explicit_customer_confirmation": True,
        "fin_note": (
            "Before proceeding, read out the deletion impact to the customer: personal data "
            "deleted within 30 days, order records retained 7 years. Confirm explicit consent "
            "before calling C4."
        ),
    })


@app.route("/api/customers/<customer_id>/delete", methods=["POST"])
def delete_account(customer_id):
    """
    C4 — Delete account.
    Fin use-case: submit account deletion request to Privacy Team.
    Fin does not action deletion itself — this creates a deletion ticket.
    Body: { "confirmed_by_customer": true, "registered_email": "..." }
    """
    cust = CUSTOMERS.get(customer_id)
    if not cust:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)

    body               = request.get_json(silent=True) or {}
    confirmed          = body.get("confirmed_by_customer")
    registered_email   = body.get("registered_email")

    if not confirmed or not registered_email:
        missing = []
        if not confirmed:
            missing.append("confirmed_by_customer (must be true)")
        if not registered_email:
            missing.append("registered_email")
        return err("missing_field", f"Required field(s) missing or invalid: {', '.join(missing)}.", 400)

    if registered_email.lower() != cust["email"].lower():
        return jsonify({
            "ok":                False,
            "deletion_submitted": False,
            "reason":            "email_mismatch",
            "fin_note": (
                "The email provided does not match the registered email on this account. "
                "For security, ask the customer to confirm the exact email address on their "
                "account before retrying."
            ),
        }), 200

    ticket_id = "DEL-" + customer_id.upper()

    return jsonify({
        "ok":                        True,
        "deletion_submitted":        True,
        "ticket_id":                 ticket_id,
        "personal_data_deletion_by": "2025-07-19",
        "order_records_retained_until": "2032-06-19",
        "confirmation_email_sent_to": cust["email"],
        "fin_note": (
            "Deletion request submitted to Privacy Team. Inform the customer they will "
            "receive a confirmation email and their personal data will be deleted within "
            "30 days. Order records are retained for 7 years per legal obligations."
        ),
    })


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN D — PRODUCTS & INVENTORY
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/products/<product_id>", methods=["GET"])
def get_product(product_id):
    """
    D1 — Product details & stock.
    Fin use-case: customer asks about stock availability, specs, lead time, or warranty.
    """
    prod = PRODUCTS.get(product_id)
    if not prod:
        return err("product_not_found", f"No product found with ID '{product_id}'.", 404)

    fin_notes = []
    if prod.get("fin_note"):
        fin_notes.append(prod["fin_note"])
    if prod["made_to_order"] and "not returnable" not in (prod.get("fin_note") or ""):
        fin_notes.append(
            "This item is not returnable unless defective. "
            "Cancellation is only available within 24 hours of order placement."
        )
    if (not prod["in_stock"]
            and prod.get("restock_eta") is None
            and not prod["made_to_order"]
            and not prod["waitlist_open"]):
        fin_notes.append(
            "Do not promise a restock date to the customer. "
            "Restock timeline is currently unknown."
        )

    resp = {
        "ok":                    True,
        "product_id":            prod["product_id"],
        "name":                  prod["name"],
        "brand":                 prod["brand"],
        "price":                 prod["price"],
        "in_stock":              prod["in_stock"],
        "stock_qty":             prod["stock_qty"],
        "made_to_order":         prod["made_to_order"],
        "lead_time_weeks":       prod.get("lead_time_weeks"),
        "ships_assembled":       prod["ships_assembled"],
        "ships_flat_pack":       prod["ships_flat_pack"],
        "assembly_time_minutes": prod.get("assembly_time_minutes"),
        "dimensions":            prod.get("dimensions"),
        "weight_kg":             prod.get("weight_kg"),
        "warranty_years":        prod.get("warranty_years"),
        "warranty_type":         prod.get("warranty_type"),
        "warranty_note":         prod.get("warranty_note"),
        "restock_eta":           prod.get("restock_eta"),
        "waitlist_open":         prod["waitlist_open"],
        "waitlist_count":        prod.get("waitlist_count"),
    }

    if fin_notes:
        resp["fin_note"] = " ".join(fin_notes)

    return jsonify(resp)


@app.route("/api/products/<product_id>/waitlist", methods=["GET"])
def get_product_waitlist(product_id):
    """
    D2 — Product waitlist info.
    Fin use-case: customer asks about joining a waitlist for an out-of-stock item.
    """
    prod = PRODUCTS.get(product_id)
    if not prod:
        return err("product_not_found", f"No product found with ID '{product_id}'.", 404)

    fin_notes = []
    if prod.get("restock_eta") is None and not prod["in_stock"]:
        fin_notes.append(
            "Do not promise a restock date to the customer. "
            "Restock timeline is currently unknown."
        )
    if not prod["waitlist_open"]:
        fin_notes.append(
            "Waitlist is not currently open for this product. "
            "Do not direct the customer to sign up."
        )

    resp = {
        "ok":                True,
        "product_id":        product_id,
        "product_name":      prod["name"],
        "in_stock":          prod["in_stock"],
        "waitlist_open":     prod["waitlist_open"],
        "waitlist_count":    prod.get("waitlist_count"),
        "restock_eta":       prod.get("restock_eta"),
        "waitlist_signup_url": (
            f"https://nestkart.com/waitlist/{product_id}"
            if prod["waitlist_open"] else None
        ),
    }

    if fin_notes:
        resp["fin_note"] = " ".join(fin_notes)

    return jsonify(resp)


@app.route("/api/products/<product_id>/waitlist", methods=["POST"])
def join_product_waitlist(product_id):
    """
    D3 — Join product waitlist.
    Fin use-case: customer asks to be notified when an out-of-stock product returns.
    Body: { "customer_id": "cust_xxx", "email": "customer@example.com", "note": "..." }
    """
    prod = PRODUCTS.get(product_id)
    if not prod:
        return err("product_not_found", f"No product found with ID '{product_id}'.", 404)

    body        = request.get_json(silent=True) or {}
    customer_id = body.get("customer_id")
    email       = body.get("email")
    note        = body.get("note", "notify me when back in stock")

    if not customer_id:
        return err("missing_field", "Required field 'customer_id' is missing.", 400)
    if not email:
        return err("missing_field", "Required field 'email' is missing.", 400)

    # If in stock, no need to join waitlist
    if prod["in_stock"]:
        return jsonify({
            "ok":              True,
            "waitlist_joined": False,
            "reason":          "product_currently_in_stock",
            "product_id":      product_id,
            "product_name":    prod["name"],
            "fin_note": (
                "The product is currently in stock. Inform the customer the item is available "
                "and direct them to purchase at nestkart.com instead of joining the waitlist."
            ),
        })

    # If waitlist not open
    if not prod["waitlist_open"]:
        return jsonify({
            "ok":              True,
            "waitlist_joined": False,
            "reason":          "waitlist_not_open",
            "product_id":      product_id,
            "product_name":    prod["name"],
            "fin_note": (
                "No waitlist is currently open for this product. Inform the customer that "
                "no waitlist is currently open for this item."
            ),
        })

    # Duplicate check
    signups_for_product = WAITLIST_SIGNUPS.setdefault(product_id, [])
    if customer_id in signups_for_product:
        return jsonify({
            "ok":              True,
            "waitlist_joined": False,
            "reason":          "already_on_waitlist",
            "product_id":      product_id,
            "product_name":    prod["name"],
            "customer_id":     customer_id,
            "fin_note": (
                "Customer is already registered on the waitlist for this product. "
                "Inform the customer they are already on the list and will be notified "
                "when the item is back in stock."
            ),
        })

    # Add to waitlist
    signups_for_product.append(customer_id)
    position = len(signups_for_product)

    return jsonify({
        "ok":                        True,
        "waitlist_joined":           True,
        "product_id":                product_id,
        "product_name":              prod["name"],
        "customer_id":               customer_id,
        "email":                     email,
        "note":                      note,
        "position_on_waitlist":      position,
        "restock_eta":               prod.get("restock_eta"),
        "confirmation_email_sent_to": email,
        "fin_note": (
            f"Customer has been added to the waitlist. Inform them they are in position "
            f"{position} and will receive a confirmation email and a restock notification "
            f"at {email}. Do not promise a specific restock date unless restock_eta is not null."
        ),
    })


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN E — DEBUG & TESTING  (no auth required)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/debug/force-error", methods=["GET"])
def force_error():
    """
    E1 — Simulate API error states for Fin error-path testing.
    Usage: GET /api/debug/force-error?status=<code>
    Accepted status codes: 400, 401, 404, 500, 503
    No auth required.
    """
    ACCEPTED = {400, 401, 404, 500, 503}
    raw = request.args.get("status")

    if not raw:
        return jsonify({
            "ok":      False,
            "error":   "bad_request",
            "message": f"Required query param 'status' is missing. Accepted values: {sorted(ACCEPTED)}.",
        }), 400

    try:
        code = int(raw)
    except ValueError:
        return jsonify({
            "ok":      False,
            "error":   "bad_request",
            "message": f"'status' must be an integer. Accepted values: {sorted(ACCEPTED)}.",
        }), 400

    if code not in ACCEPTED:
        return jsonify({
            "ok":      False,
            "error":   "bad_request",
            "message": f"'{code}' is not accepted. Accepted values: {sorted(ACCEPTED)}.",
        }), 400

    return jsonify({
        "ok":               False,
        "error":            "simulated_error",
        "simulated_status": code,
        "message":          f"This is a simulated {code} error for Fin workflow testing.",
    }), code


@app.route("/api/debug/scenarios", methods=["GET"])
def debug_scenarios():
    """
    E2 — Test scenario index.
    Returns all test IDs and their intended scenario notes for Fin QA.
    No auth required.
    """
    return jsonify({
        "ok": True,
        "scenarios": {
            "customers": [
                {
                    "id":       "cust_001",
                    "name":     "Priya Sharma",
                    "state":    "NY",
                    "scenario": (
                        "Standard NY customer. Has an active in-transit candle order (ORD-10052) "
                        "and a delivered sofa with an overdue refund (RET-2201). "
                        "Valid Visa on file. Tests: in-transit state, overdue refund escalation."
                    ),
                },
                {
                    "id":       "cust_002",
                    "name":     "James Okafor",
                    "state":    "CA",
                    "scenario": (
                        "CA customer with a dispatched furniture order (ORD-10063) and an active "
                        "damage claim on a delivered Dutch Oven (ORD-10118, RET-2203). "
                        "Tests: dispatched state, damage claim escalation flow."
                    ),
                },
                {
                    "id":       "cust_003",
                    "name":     "Lisa Tran",
                    "state":    "TX",
                    "scenario": (
                        "TX customer with a processing order that hasn't dispatched yet (ORD-10074). "
                        "Address is still changeable. Tests: address change workflow."
                    ),
                },
                {
                    "id":       "cust_004",
                    "name":     "Marcus Webb",
                    "state":    "AK",
                    "scenario": (
                        "Alaska customer. AK standard surcharge +$12 applied to ORD-10085. "
                        "Express shipping unavailable. Order is still cancellable. "
                        "Tests: AK policy surcharge, cancellation flow."
                    ),
                },
                {
                    "id":       "cust_005",
                    "name":     "Anika Rossi",
                    "state":    "CA",
                    "scenario": (
                        "CA customer with a made-to-order sofa in production (ORD-10096, non-cancellable) "
                        "and a delivered item whose 30-day return window has expired (ORD-10107). "
                        "Expired Mastercard on file. "
                        "Tests: MTO escalation, expired return window, expired payment method."
                    ),
                },
            ],
            "orders": [
                {
                    "id":       "ORD-10041",
                    "customer": "cust_001",
                    "scenario": (
                        "Delivered Harlow Sofa (furniture > $300). 14-day return window expired "
                        "2025-06-01. Return received (RET-2201) but refund is overdue. "
                        "Tests: furniture return window, overdue refund escalation."
                    ),
                },
                {
                    "id":       "ORD-10052",
                    "customer": "cust_001",
                    "scenario": (
                        "In-transit candle order. Not yet delivered. "
                        "RET-2202 is an ineligible return (opened candle). "
                        "Tests: in-transit state, opened-candle non-returnable policy."
                    ),
                },
                {
                    "id":       "ORD-10063",
                    "customer": "cust_002",
                    "scenario": (
                        "Dispatched Elm Dining Table (large item, $49.99 shipping). "
                        "Not yet delivered; address change and cancellation no longer possible. "
                        "Tests: dispatched-not-delivered state."
                    ),
                },
                {
                    "id":       "ORD-10074",
                    "customer": "cust_003",
                    "scenario": (
                        "Processing Stoneware Dinner Set. Not yet dispatched — address still changeable. "
                        "cancellable=false (2-hour window elapsed). "
                        "Tests: address-change-possible flow."
                    ),
                },
                {
                    "id":       "ORD-10085",
                    "customer": "cust_004",
                    "scenario": (
                        "Processing Ridgeline Bookshelf to Alaska. cancellable=true. "
                        "Shipping $17.99 (base $5.99 + AK surcharge $12). "
                        "Tests: cancellation, AK surcharge policy."
                    ),
                },
                {
                    "id":       "ORD-10096",
                    "customer": "cust_005",
                    "scenario": (
                        "Made-to-order Custom Linen Sofa in production. cancellable=false "
                        "(24-hour MTO cancellation window elapsed). Non-returnable unless defective. "
                        "Tests: MTO escalation, non-cancellable state."
                    ),
                },
                {
                    "id":       "ORD-10107",
                    "customer": "cust_005",
                    "scenario": (
                        "Delivered Marble & Brass Side Table. 30-day return window expired 2025-05-08. "
                        "Tests: expired standard return window, agent exception required."
                    ),
                },
                {
                    "id":       "ORD-10118",
                    "customer": "cust_002",
                    "scenario": (
                        "Delivered Dutch Oven with active damage claim (RET-2203). "
                        "Cracked enamel reported within 48-hour window; photos submitted. "
                        "Tests: damage claim — Fin must not offer autonomous refund."
                    ),
                },
            ],
            "returns": [
                {
                    "id":       "RET-2201",
                    "order":    "ORD-10041",
                    "scenario": (
                        "Return received for Harlow Sofa (item_not_as_described). "
                        "refund_status=processing. refund_estimated_date=2025-06-06 — OVERDUE, "
                        "no refund_issued_date. Tests: overdue refund escalation to Billing Team."
                    ),
                },
                {
                    "id":       "RET-2202",
                    "order":    "ORD-10052",
                    "scenario": (
                        "Return requested for opened candle (change_of_mind). "
                        "INELIGIBLE — opened candles are non-returnable. "
                        "Tests: policy enforcement and escalation to close invalid return."
                    ),
                },
                {
                    "id":       "RET-2203",
                    "order":    "ORD-10118",
                    "scenario": (
                        "Damage claim for Dutch Oven (damaged_on_arrival). Status: under_review. "
                        "Tests: damage claim flow — Fin must not confirm refund until review completes."
                    ),
                },
            ],
            "products": [
                {"id": "prod_001", "scenario": "Harlow Sofa — in stock (qty 4), ships flat-pack, 2yr warranty."},
                {"id": "prod_002", "scenario": "Elm Dining Table — OUT OF STOCK, restock_eta 2025-07-14, waitlist open (23 entries). cust_003 (Lisa Tran) is pre-seeded on this waitlist — use to test duplicate handling."},
                {"id": "prod_003", "scenario": "Cast Iron Dutch Oven — in stock, LIFETIME warranty. Tests: lifetime warranty disclosure."},
                {"id": "prod_004", "scenario": "Custom Linen Sofa — made-to-order, 5-week lead time, non-returnable unless defective."},
                {"id": "prod_005", "scenario": "Ridgeline Bookshelf — in stock (qty 7), 22kg, ships flat-pack."},
                {"id": "prod_006", "scenario": "Marble & Brass Side Table — in stock (qty 3), ships assembled."},
            ],
        }
    })


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"NestKart Mock API v2.2.0 — listening on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
