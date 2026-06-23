"""
================================================================================
NestKart Mock API Server — v3.0.0
================================================================================
A mock backend API for NestKart, designed for use with Intercom Fin Actions.
All data is hardcoded in-memory. No database, ORM, or file I/O required.

INSTALL:
    pip install flask flask-cors

RUN LOCALLY:
    python app_v3.py
    Server starts on http://0.0.0.0:5050

    Railway deployment reads PORT from environment and starts via gunicorn.

AUTHENTICATION:
    All endpoints require auth.
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

ENDPOINTS (8 total):
    --- Domain A: Orders & Tracking ---
    GET  /api/orders/<order_id>                         Order status & details
    GET  /api/customers/<customer_id>/orders            Customer order history
    POST /api/orders/<order_id>/cancel                  Cancel an order
    GET  /api/tickets/<ticket_id>                       Check support ticket status
    --- Domain B: Returns & Refunds ---
    GET  /api/orders/<order_id>/return-eligibility      Check return eligibility
    POST /api/orders/<order_id>/returns                 Initiate a return
    GET  /api/returns/<return_id>                       Return & refund status
    --- Domain C: Account & Profile ---
    GET  /api/customers/<customer_id>                   Customer profile

TEST IDs:
    Customers : cust_001 · cust_002 · cust_003 · cust_004 · cust_005
    Orders    : ORD-10041 · ORD-10042 · ORD-10043 · ORD-10044 · ORD-10045  (cust_001)
                ORD-10051 · ORD-10052 · ORD-10053 · ORD-10054 · ORD-10055  (cust_002)
                ORD-10061 · ORD-10062 · ORD-10063 · ORD-10064 · ORD-10065  (cust_003)
                ORD-10071 · ORD-10072 · ORD-10073 · ORD-10074 · ORD-10075  (cust_004)
                ORD-10081 · ORD-10082 · ORD-10083 · ORD-10084 · ORD-10085  (cust_005)
    Returns   : RET-2201 · RET-2202 · RET-2203
    Tickets   : TKT-3301 · TKT-3302 · TKT-3303

SECURITY NOTES:
    - Never expose sensitive data (no full card numbers, no passwords)
    - Auth keys are dev/mock only — never use in production
    - Do not cancel ORD-10083 (MTO past cancellation window) regardless of request body
    - Do not confirm refund for RET-2202 (opened candles are non-returnable)
    - Do not confirm refund for RET-2203 until Returns Team review is complete
    - Do not offer autonomous refund for ORD-10055 (active damage claim)
    - Do not confirm cancellation or return eligibility for ORD-10083 without agent escalation

GUARDRAILS — ENFORCEMENT LEVEL:
    Hard (server-enforced — Fin cannot bypass by ignoring fin_note):
        - cancellable flag blocks cancel actions
        - return eligibility (eligible: false) blocks return creation
        - ownership_mismatch (403) on cancel / initiate-return
          if the customer_id in the request body does not match the actual order owner
    Soft (prose-only via fin_note — Fin must read and obey):
        - AK/HI surcharge disclosures, restock-date warnings, expired-payment-method flags
================================================================================
"""

import os
from datetime import date, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
from flask import send_from_directory

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    if '.' in filename and not filename.startswith('api'):
        return send_from_directory('.', filename)
    return jsonify({"error": "not_found"}), 404

# ─────────────────────────────────────────────────────────────────────────────
# AUTH CONFIG
# ─────────────────────────────────────────────────────────────────────────────
VALID_API_KEY = "nk-fin-dev-key-2025"
VALID_BEARER  = "nk-bearer-dev-token-2025"

# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — CUSTOMERS
# ─────────────────────────────────────────────────────────────────────────────
CUSTOMERS = {
    "cust_001": {
        "customer_id": "cust_001",
        "name": "Priya Sharma",
        "email": "taruna2004126@gmail.com",
        "account_created": "2024-03-10",
        "marketing_opt_in": True,
        "state": "NY",
    },
    "cust_002": {
        "customer_id": "cust_002",
        "name": "James Okafor",
        "email": "11182tarunask@gmail.com",
        "account_created": "2023-11-22",
        "marketing_opt_in": False,
        "state": "CA",
    },
    "cust_003": {
        "customer_id": "cust_003",
        "name": "Lisa Tran",
        "email": "tarunask.1806@gmail.com",
        "account_created": "2025-01-05",
        "marketing_opt_in": True,
        "state": "TX",
    },
    "cust_004": {
        "customer_id": "cust_004",
        "name": "Marcus Webb",
        "email": "taruna.stockmarket@gmail.com",
        "account_created": "2024-08-19",
        "marketing_opt_in": False,
        "state": "AK",
    },
    "cust_005": {
        "customer_id": "cust_005",
        "name": "Anika Rossi",
        "email": "taruna2210569@ssn.edu.in",
        "account_created": "2024-12-01",
        "marketing_opt_in": True,
        "state": "CA",
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — ORDERS  (5 per customer, mix of statuses)
# ─────────────────────────────────────────────────────────────────────────────
ORDERS = {

    # ── cust_001 : Priya Sharma ───────────────────────────────────────────────
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
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10042": {
        "order_id":           "ORD-10042",
        "customer_id":        "cust_001",
        "item_name":          "Soy Wax Candle Set — Cedarwood & Amber (300g × 3)",
        "qty":                3,
        "price_total":        "$89.00",
        "status":             "in_transit",
        "placed_at":          "2025-06-14T10:05:00-05:00",
        "dispatched_at":      "2025-06-14T16:00:00-05:00",
        "estimated_delivery": "2025-06-20",
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456785",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10043": {
        "order_id":           "ORD-10043",
        "customer_id":        "cust_001",
        "item_name":          "Ridgeline Bookshelf, Walnut",
        "qty":                1,
        "price_total":        "$215.00",
        "status":             "processing",
        "placed_at":          "2025-06-17T08:45:00-05:00",
        "dispatched_at":      None,
        "estimated_delivery": "2025-06-24",
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    None,
        "cancellable":        True,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10044": {
        "order_id":           "ORD-10044",
        "customer_id":        "cust_001",
        "item_name":          "Marble & Brass Side Table",
        "qty":                1,
        "price_total":        "$189.00",
        "status":             "cancelled",
        "placed_at":          "2025-04-20T11:30:00-05:00",
        "dispatched_at":      None,
        "estimated_delivery": None,
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            None,
        "tracking_number":    None,
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           "Order was cancelled at customer request before dispatch. Refund issued to original payment method.",
    },
    "ORD-10045": {
        "order_id":           "ORD-10045",
        "customer_id":        "cust_001",
        "item_name":          "Stoneware Dinner Set (4-piece), Sage Green",
        "qty":                1,
        "price_total":        "$89.00",
        "status":             "delivered",
        "placed_at":          "2025-03-05T09:00:00-05:00",
        "dispatched_at":      "2025-03-06T10:00:00-05:00",
        "estimated_delivery": "2025-03-10",
        "delivered_at":       "2025-03-10",
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456780",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           (
            "Return window expired. Standard 30-day return window from delivery (2025-03-10) "
            "expired on 2025-04-09. Any return request for this order requires agent exception approval."
        ),
    },

    # ── cust_002 : James Okafor ───────────────────────────────────────────────
    "ORD-10051": {
        "order_id":           "ORD-10051",
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
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10052": {
        "order_id":           "ORD-10052",
        "customer_id":        "cust_002",
        "item_name":          "Harlow Sofa (2-seater), Slate Grey",
        "qty":                1,
        "price_total":        "$699.00",
        "status":             "delivered",
        "placed_at":          "2025-05-01T14:00:00-05:00",
        "dispatched_at":      "2025-05-03T09:00:00-05:00",
        "estimated_delivery": "2025-05-09",
        "delivered_at":       "2025-05-09",
        "shipping_method":    "large_item",
        "shipping_cost":      "$49.99",
        "carrier":            "FedEx Freight",
        "tracking_number":    "1Z999AA10123456787",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           (
            "Return window expired. Furniture over $300 has a 14-day return window "
            "which elapsed on 2025-05-23. Agent exception required for any return."
        ),
    },
    "ORD-10053": {
        "order_id":           "ORD-10053",
        "customer_id":        "cust_002",
        "item_name":          "Bamboo Storage Basket Set (3-pack)",
        "qty":                1,
        "price_total":        "$55.00",
        "status":             "processing",
        "placed_at":          "2025-06-18T11:00:00-05:00",
        "dispatched_at":      None,
        "estimated_delivery": "2025-06-25",
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    None,
        "cancellable":        True,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10054": {
        "order_id":           "ORD-10054",
        "customer_id":        "cust_002",
        "item_name":          "Linen Throw Blanket, Terracotta",
        "qty":                2,
        "price_total":        "$98.00",
        "status":             "delivered",
        "placed_at":          "2025-04-10T10:00:00-05:00",
        "dispatched_at":      "2025-04-11T09:00:00-05:00",
        "estimated_delivery": "2025-04-15",
        "delivered_at":       "2025-04-15",
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456788",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10055": {
        "order_id":           "ORD-10055",
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
        "damage_claim_active": True,
        "fin_note": (
            "Active damage claim on this order. Customer reported cracked enamel coating "
            "on 2025-06-06 (within 48-hour window) with photos submitted. Claim status: "
            "under_review. Do not offer refund autonomously — escalate to Returns Team."
        ),
    },

    # ── cust_003 : Lisa Tran ──────────────────────────────────────────────────
    "ORD-10061": {
        "order_id":           "ORD-10061",
        "customer_id":        "cust_003",
        "item_name":          "Stoneware Dinner Set (4-piece), Sage Green × 2",
        "qty":                2,
        "price_total":        "$178.00",
        "status":             "processing",
        "placed_at":          "2025-06-17T08:45:00-05:00",
        "dispatched_at":      None,
        "estimated_delivery": "2025-06-24",
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    None,
        "cancellable":        True,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10062": {
        "order_id":           "ORD-10062",
        "customer_id":        "cust_003",
        "item_name":          "Velvet Accent Chair, Dusty Rose",
        "qty":                1,
        "price_total":        "$320.00",
        "status":             "delivered",
        "placed_at":          "2025-05-20T13:00:00-05:00",
        "dispatched_at":      "2025-05-22T09:00:00-05:00",
        "estimated_delivery": "2025-05-28",
        "delivered_at":       "2025-05-28",
        "shipping_method":    "large_item",
        "shipping_cost":      "$49.99",
        "carrier":            "FedEx Freight",
        "tracking_number":    "1Z999AA10123456791",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           (
            "Return window expired. Furniture over $300 has a 14-day return window "
            "which elapsed on 2025-06-11. Agent exception required for any return."
        ),
    },
    "ORD-10063": {
        "order_id":           "ORD-10063",
        "customer_id":        "cust_003",
        "item_name":          "Scented Diffuser Set — Eucalyptus",
        "qty":                1,
        "price_total":        "$45.00",
        "status":             "cancelled",
        "placed_at":          "2025-06-10T09:00:00-05:00",
        "dispatched_at":      None,
        "estimated_delivery": None,
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            None,
        "tracking_number":    None,
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           "Order was cancelled at customer request before dispatch. Refund issued to original payment method.",
    },
    "ORD-10064": {
        "order_id":           "ORD-10064",
        "customer_id":        "cust_003",
        "item_name":          "Elm Coffee Table",
        "qty":                1,
        "price_total":        "$299.00",
        "status":             "in_transit",
        "placed_at":          "2025-06-13T10:30:00-05:00",
        "dispatched_at":      "2025-06-14T09:00:00-05:00",
        "estimated_delivery": "2025-06-21",
        "delivered_at":       None,
        "shipping_method":    "large_item",
        "shipping_cost":      "$49.99",
        "carrier":            "FedEx Freight",
        "tracking_number":    "1Z999AA10123456792",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10065": {
        "order_id":           "ORD-10065",
        "customer_id":        "cust_003",
        "item_name":          "Ceramic Vase Set (3-piece), Matte White",
        "qty":                1,
        "price_total":        "$72.00",
        "status":             "delivered",
        "placed_at":          "2025-06-01T08:00:00-05:00",
        "dispatched_at":      "2025-06-02T08:00:00-05:00",
        "estimated_delivery": "2025-06-06",
        "delivered_at":       "2025-06-06",
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456793",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           None,
    },

    # ── cust_004 : Marcus Webb (AK) ───────────────────────────────────────────
    "ORD-10071": {
        "order_id":           "ORD-10071",
        "customer_id":        "cust_004",
        "item_name":          "Ridgeline Bookshelf, Walnut",
        "qty":                1,
        "price_total":        "$227.99",
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
        "damage_claim_active": False,
        "fin_note": (
            "This order is shipping to Alaska. Standard AK surcharge of $12.00 has been "
            "applied (base $5.99 + $12.00 = $17.99). Express shipping is not available for AK/HI."
        ),
    },
    "ORD-10072": {
        "order_id":           "ORD-10072",
        "customer_id":        "cust_004",
        "item_name":          "Linen Throw Blanket, Slate",
        "qty":                1,
        "price_total":        "$57.99",
        "status":             "delivered",
        "placed_at":          "2025-05-15T09:00:00-05:00",
        "dispatched_at":      "2025-05-16T10:00:00-05:00",
        "estimated_delivery": "2025-05-24",
        "delivered_at":       "2025-05-24",
        "shipping_method":    "standard",
        "shipping_cost":      "$17.99",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456794",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           "AK order — standard surcharge applied at time of purchase.",
    },
    "ORD-10073": {
        "order_id":           "ORD-10073",
        "customer_id":        "cust_004",
        "item_name":          "Bamboo Storage Basket Set (3-pack)",
        "qty":                2,
        "price_total":        "$122.99",
        "status":             "in_transit",
        "placed_at":          "2025-06-12T11:00:00-05:00",
        "dispatched_at":      "2025-06-13T08:00:00-05:00",
        "estimated_delivery": "2025-06-25",
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$17.99",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456795",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           "AK order — standard surcharge applied. Express shipping not available.",
    },
    "ORD-10074": {
        "order_id":           "ORD-10074",
        "customer_id":        "cust_004",
        "item_name":          "Ceramic Serving Bowl, Speckled Clay",
        "qty":                1,
        "price_total":        "$61.99",
        "status":             "cancelled",
        "placed_at":          "2025-04-05T08:00:00-05:00",
        "dispatched_at":      None,
        "estimated_delivery": None,
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            None,
        "tracking_number":    None,
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           "Order cancelled at customer request before dispatch. Refund issued to original payment method.",
    },
    "ORD-10075": {
        "order_id":           "ORD-10075",
        "customer_id":        "cust_004",
        "item_name":          "Scented Candle — Firewood & Pine (400g)",
        "qty":                3,
        "price_total":        "$107.97",
        "status":             "delivered",
        "placed_at":          "2025-03-20T10:00:00-05:00",
        "dispatched_at":      "2025-03-21T09:00:00-05:00",
        "estimated_delivery": "2025-03-31",
        "delivered_at":       "2025-03-31",
        "shipping_method":    "standard",
        "shipping_cost":      "$17.99",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456796",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           (
            "Return window expired. Standard 30-day return window from delivery (2025-03-31) "
            "expired on 2025-04-30. AK surcharge applied at time of purchase."
        ),
    },

    # ── cust_005 : Anika Rossi ────────────────────────────────────────────────
    "ORD-10081": {
        "order_id":           "ORD-10081",
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
        "damage_claim_active": False,
        "fin_note": (
            "Return window expired. Standard 30-day return window from delivery (2025-04-08) "
            "expired on 2025-05-08. Any return request requires agent exception approval."
        ),
    },
    "ORD-10082": {
        "order_id":           "ORD-10082",
        "customer_id":        "cust_005",
        "item_name":          "Velvet Accent Chair, Forest Green",
        "qty":                1,
        "price_total":        "$320.00",
        "status":             "in_transit",
        "placed_at":          "2025-06-13T11:00:00-05:00",
        "dispatched_at":      "2025-06-14T08:00:00-05:00",
        "estimated_delivery": "2025-06-21",
        "delivered_at":       None,
        "shipping_method":    "large_item",
        "shipping_cost":      "$49.99",
        "carrier":            "FedEx Freight",
        "tracking_number":    "1Z999AA10123456797",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10083": {
        "order_id":           "ORD-10083",
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
        "damage_claim_active": False,
        "fin_note": (
            "This is a made-to-order item. The 24-hour cancellation window has elapsed — "
            "this order cannot be cancelled. Made-to-order items are not eligible for return "
            "unless defective. Do not confirm cancellation or return eligibility without "
            "escalating to an agent."
        ),
    },
    "ORD-10084": {
        "order_id":           "ORD-10084",
        "customer_id":        "cust_005",
        "item_name":          "Ceramic Vase Set (3-piece), Blush",
        "qty":                1,
        "price_total":        "$72.00",
        "status":             "processing",
        "placed_at":          "2025-06-18T14:00:00-05:00",
        "dispatched_at":      None,
        "estimated_delivery": "2025-06-25",
        "delivered_at":       None,
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    None,
        "cancellable":        True,
        "damage_claim_active": False,
        "fin_note":           None,
    },
    "ORD-10085": {
        "order_id":           "ORD-10085",
        "customer_id":        "cust_005",
        "item_name":          "Stoneware Mug Set (4-piece), Charcoal",
        "qty":                1,
        "price_total":        "$64.00",
        "status":             "delivered",
        "placed_at":          "2025-05-30T09:00:00-05:00",
        "dispatched_at":      "2025-05-31T08:00:00-05:00",
        "estimated_delivery": "2025-06-04",
        "delivered_at":       "2025-06-04",
        "shipping_method":    "standard",
        "shipping_cost":      "$0.00",
        "carrier":            "UPS",
        "tracking_number":    "1Z999AA10123456798",
        "cancellable":        False,
        "damage_claim_active": False,
        "fin_note":           None,
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
        "order_id":               "ORD-10042",
        "customer_id":            "cust_001",
        "item_name":              "Soy Wax Candle — Cedarwood & Amber (one unit, opened)",
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
        "order_id":               "ORD-10055",
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

# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — TICKETS
# ─────────────────────────────────────────────────────────────────────────────
TICKETS = {
    "TKT-3301": {
        "ticket_id":       "TKT-3301",
        "customer_id":     "cust_001",
        "order_id":        "ORD-10041",
        "subject":         "Harlow Sofa refund not received — overdue",
        "status":          "in_progress",
        "created_at":      "2025-06-07",
        "last_updated":    "2025-06-10",
        "resolution_note": None,
        "fin_note": (
            "This ticket is open because the refund for RET-2201 is overdue. "
            "Do not promise a refund date — escalate to Billing Team if the customer presses."
        ),
    },
    "TKT-3302": {
        "ticket_id":       "TKT-3302",
        "customer_id":     "cust_002",
        "order_id":        "ORD-10055",
        "subject":         "Dutch Oven arrived with cracked enamel — damage claim",
        "status":          "open",
        "created_at":      "2025-06-06",
        "last_updated":    "2025-06-06",
        "resolution_note": None,
        "fin_note": (
            "Active damage claim under review (RET-2203). Do not confirm refund or "
            "replacement autonomously — await Returns Team decision."
        ),
    },
    "TKT-3303": {
        "ticket_id":       "TKT-3303",
        "customer_id":     "cust_003",
        "order_id":        "ORD-10061",
        "subject":         "Request to cancel order before dispatch",
        "status":          "resolved",
        "created_at":      "2025-06-17",
        "last_updated":    "2025-06-18",
        "resolution_note": (
            "Customer requested cancellation of ORD-10061. Order was still in processing "
            "and was successfully cancelled. Refund confirmation email sent."
        ),
        "fin_note": None,
    },
}

# In-memory store for returns created at runtime via POST /api/orders/<id>/returns
DYNAMIC_RETURNS  = {}
_return_id_counter = [2204]  # mutable list so nested functions can increment it


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
    Used by all mutating endpoints (cancel, initiate-return) to stop Fin from actioning
    one customer's order using another customer's ID.
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


def _return_eligibility(order_id):
    """
    Return a dict with eligibility details for each hardcoded order.
    Used by both B1 (GET return-eligibility) and B2 (POST returns).
    """
    order = ORDERS.get(order_id, {})
    status = order.get("status")

    # Orders not yet delivered
    if status in ("processing", "dispatched", "in_transit", "in_production"):
        # Made-to-order special case
        if "made to order" in order.get("item_name", "").lower() or not order.get("cancellable") and status == "in_production":
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
                "item_condition_requirements": "N/A — made-to-order items are non-returnable unless defective.",
                "fin_note": (
                    "Made-to-order items are not returnable unless defective. "
                    "Do not confirm return eligibility without escalating to an agent. "
                    "If the customer believes the item is defective, collect details and escalate."
                ),
            }
        return {
            "eligible": False,
            "reason": "Order has not yet been delivered. Return can only be initiated after confirmed delivery.",
            "return_window_days":       30,
            "return_window_expires_on": None,
            "days_remaining":           None,
            "return_shipping_cost":     "$8.00–$15.00 estimated (customer pays — change of mind); free if defective",
            "item_condition_requirements": "Unused, in original packaging.",
            "fin_note": (
                "Order has not yet been delivered. Return eligibility cannot be confirmed "
                "until delivery is complete."
            ),
        }

    # Cancelled orders
    if status == "cancelled":
        return {
            "eligible": False,
            "reason": "Order was cancelled and cannot be returned.",
            "return_window_days":       None,
            "return_window_expires_on": None,
            "days_remaining":           None,
            "return_shipping_cost":     None,
            "item_condition_requirements": None,
            "fin_note": "Order is cancelled. No return is possible — a refund was issued at cancellation.",
        }

    # Delivered orders with active damage claim
    if order.get("damage_claim_active"):
        return {
            "eligible": True,
            "reason": "Item was reported damaged on arrival. Active damage claim under review.",
            "return_window_days":       30,
            "return_window_expires_on": None,
            "days_remaining":           None,
            "return_shipping_cost":     "free",
            "item_condition_requirements": "Item must be in received condition. Original packaging preferred.",
            "refund_locked":            True,
            "refund_locked_reason":     "damage_claim_under_review",
            "fin_note": (
                "Active damage claim under review. Do not confirm refund amount or final "
                "timeline until the Returns Team completes their review. Escalate if customer "
                "requires immediate resolution."
            ),
        }

    # Delivered — check return window
    delivered_at = order.get("delivered_at")
    price_val = parse_price(order.get("price_total"))
    # Furniture over $300 gets 14-day window; everything else 30-day
    window_days = 14 if (price_val and price_val > 300 and order.get("shipping_method") == "large_item") else 30

    if delivered_at:
        from datetime import datetime
        delivery_date = datetime.strptime(delivered_at, "%Y-%m-%d").date()
        expiry_date = delivery_date + timedelta(days=window_days)
        today = date.today()
        days_remaining = (expiry_date - today).days

        if days_remaining <= 0:
            return {
                "eligible": False,
                "reason": (
                    f"Return window has expired. The {window_days}-day return window from "
                    f"delivery ({delivered_at}) expired on {expiry_date.isoformat()}."
                ),
                "return_window_days":       window_days,
                "return_window_expires_on": expiry_date.isoformat(),
                "days_remaining":           0,
                "return_shipping_cost":     "$8.00–$15.00 estimated (customer pays)",
                "item_condition_requirements": "Unused, in original packaging.",
                "fin_note": (
                    f"Return window expired on {expiry_date.isoformat()}. "
                    "Any return request for this order requires agent exception approval."
                ),
            }
        else:
            return {
                "eligible": True,
                "reason": f"Item is within the {window_days}-day return window.",
                "return_window_days":       window_days,
                "return_window_expires_on": expiry_date.isoformat(),
                "days_remaining":           days_remaining,
                "return_shipping_cost":     "free (defect/description mismatch); $8.00–$15.00 customer pays (change of mind)",
                "item_condition_requirements": "Unused, in original packaging.",
                "fin_note": None,
            }

    # Fallback
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
    if not request.path.startswith("/api"):
        return

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
            "See the README block at the top of app_v3.py for accepted values."
        ),
    }), 401


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


@app.route("/api/tickets/<ticket_id>", methods=["GET"])
def get_ticket(ticket_id):
    """
    A4 — Check support ticket status.
    Fin use-case: customer asks about the status of a support ticket.
    """
    ticket = TICKETS.get(ticket_id)
    if not ticket:
        return err("ticket_not_found", f"No ticket found with ID '{ticket_id}'.", 404)

    return jsonify({"ok": True, **ticket})


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
    body = request.get_json(silent=True, force=True) or {}

    customer_id          = body.get("customer_id")
    reason               = body.get("reason")
    condition            = body.get("condition")
    has_original_pkg     = body.get("has_original_packaging")
    if isinstance(has_original_pkg, str):
        has_original_pkg = has_original_pkg.lower() == "true"
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


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN C — ACCOUNT & PROFILE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/customers/<customer_id>", methods=["GET"])
def get_customer(customer_id):
    """
    C1 — Customer profile.
    Fin use-case: identity confirmation, account enquiries.
    """
    cust = CUSTOMERS.get(customer_id)
    if not cust:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)

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
        "payment_method": {
            "type":         payment["type"],
            "last_four":    payment["last_four"],
            "expiry_month": payment["expiry_month"],
            "expiry_year":  payment["expiry_year"],
            "is_expired":   payment["is_expired"],
        } if payment else None,
    }

    if fin_notes:
        resp["fin_note"] = " ".join(fin_notes)

    return jsonify(resp)


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"NestKart Mock API v3.0.0 — listening on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
