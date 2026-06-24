"""
================================================================================
NestKart Mock API Server — v4.0.0
================================================================================
A mock backend API for NestKart, designed for use with Intercom Fin Actions.
All data is hardcoded in-memory. No database, ORM, or file I/O required.

WHAT'S NEW IN v4.0.0:
    - Canvas Kit section fully rewritten with two self-contained home screen cards:
        Card 1 — Order Tracker   (/messenger/tracker/initialize + /submit)
        Card 2 — Cancel an Order (/messenger/cancel/initialize  + /submit)
    - Each card completes its job inside the Messenger without opening a chat.
    - Cancel card calls internal cancel logic directly (no HTTP round-trip).
    - Old single-card topic-picker (v3) removed entirely.

CANVAS KIT ENDPOINTS:
    Card 1 — Order Tracker
        Initialize : https://nestkart.up.railway.app/messenger/tracker/initialize
        Submit     : https://nestkart.up.railway.app/messenger/tracker/submit

    Card 2 — Cancel an Order
        Initialize : https://nestkart.up.railway.app/messenger/cancel/initialize
        Submit     : https://nestkart.up.railway.app/messenger/cancel/submit

INSTALL:
    pip install flask flask-cors

RUN LOCALLY:
    python appv2.py
    Server starts on http://0.0.0.0:5050

    Railway deployment reads PORT from environment and starts via gunicorn.

AUTHENTICATION:
    All /api/* endpoints require auth.
    Canvas Kit /messenger/* endpoints do NOT require auth (Intercom signs them).
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

ENDPOINTS (7 total):
    --- Domain A: Orders & Tracking ---
    GET  /api/orders/<order_id>                         Order status & details
    GET  /api/customers/<customer_id>/orders            Customer order history
    POST /api/orders/<order_id>/cancel                  Cancel an order
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
from flask import send_from_directory

app = Flask(__name__)
CORS(app)

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')


# ═════════════════════════════════════════════════════════════════════════════
# CANVAS KIT — TWO HOME SCREEN CARDS
#
# Card 1 — Order Tracker
#   Initialize : /messenger/tracker/initialize
#   Submit     : /messenger/tracker/submit
#
# Card 2 — Cancel an Order
#   Initialize : /messenger/cancel/initialize
#   Submit     : /messenger/cancel/submit
#
# These routes MUST stay above the catch-all /<path:filename> route below.
# ═════════════════════════════════════════════════════════════════════════════


# ─────────────────────────────────────────────────────────────────────────────
# SHARED CANVAS HELPERS
# ─────────────────────────────────────────────────────────────────────────────

_STATUS_LABEL = {
    "processing":   "⏳ Processing",
    "dispatched":   "📦 Dispatched",
    "in_transit":   "🚚 In transit",
    "delivered":    "✅ Delivered",
    "cancelled":    "❌ Cancelled",
    "in_production":"🔨 In production",
}

def _status_label(status):
    return _STATUS_LABEL.get(status, status.replace("_", " ").title())


def _fmt_date(iso):
    """'2025-06-20' → 'Jun 20, 2025'. Returns None if input is None."""
    if not iso:
        return None
    try:
        from datetime import datetime
        return datetime.strptime(str(iso)[:10], "%Y-%m-%d").strftime("%b %-d, %Y")
    except Exception:
        return iso


def _normalize_order_id(raw):
    """Accept 'ord-10041', '10041', 'ORD10041', 'ORD-10041' — all → 'ORD-10041'."""
    if not raw:
        return None
    normalized = raw.strip().upper()
    if normalized.startswith("ORD-"):
        return normalized
    digits = normalized.replace("ORD", "").replace("-", "").strip()
    if digits.isdigit():
        return f"ORD-{digits}"
    return normalized


# ─────────────────────────────────────────────────────────────────────────────
# CARD 1 — ORDER TRACKER
# ─────────────────────────────────────────────────────────────────────────────

def _tracker_home():
    """Order Tracker — initial input screen."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text", "id": "t_hd",
                        "text": "Track your order",
                        "style": "header", "align": "center",
                    },
                    {
                        "type": "text", "id": "t_sub",
                        "text": "Enter your order ID to see live status, carrier, and estimated delivery.",
                        "style": "muted", "align": "center",
                    },
                    {"type": "spacer", "size": "s"},
                    {
                        "type": "input", "id": "tracker_order_id",
                        "label": "Order ID",
                        "placeholder": "e.g. ORD-10041",
                        "action": {"type": "submit"},
                    },
                    {"type": "spacer", "size": "xs"},
                    {
                        "type": "button", "id": "tracker_lookup_btn",
                        "label": "Check order status",
                        "style": "primary",
                        "action": {"type": "submit"},
                    },
                ]
            }
        }
    }


def _tracker_result(order):
    """Order Tracker — result screen built from an order dict."""
    order_id  = order["order_id"]
    status    = order["status"]
    item_name = order["item_name"]
    qty       = order["qty"]
    price     = order["price_total"]
    carrier   = order.get("carrier")
    tracking  = order.get("tracking_url") or (
        f"https://track.nestkart.com/{order['tracking_number']}"
        if order.get("tracking_number") else None
    )
    est_del   = _fmt_date(order.get("estimated_delivery"))
    delivered = _fmt_date(order.get("delivered_at"))
    damage    = order.get("damage_claim_active", False)
    cancellable = order.get("cancellable", False)

    components = [
        {
            "type": "text", "id": "tr_order_id",
            "text": order_id, "style": "header", "align": "center",
        },
        {
            "type": "text", "id": "tr_status",
            "text": _status_label(status),
            "style": "paragraph", "align": "center",
        },
        {"type": "divider"},
        {
            "type": "text", "id": "tr_item_lbl",
            "text": "Item", "style": "muted",
        },
        {
            "type": "text", "id": "tr_item_val",
            "text": f"{item_name} × {qty}  ·  {price}",
            "style": "paragraph",
        },
        {"type": "spacer", "size": "xs"},
    ]

    # Delivery date or ETA
    if delivered:
        components += [
            {"type": "text", "id": "tr_del_lbl", "text": "Delivered", "style": "muted"},
            {"type": "text", "id": "tr_del_val", "text": delivered, "style": "paragraph"},
            {"type": "spacer", "size": "xs"},
        ]
    elif est_del and status not in ("cancelled", "processing"):
        components += [
            {"type": "text", "id": "tr_eta_lbl", "text": "Estimated delivery", "style": "muted"},
            {"type": "text", "id": "tr_eta_val", "text": est_del, "style": "paragraph"},
            {"type": "spacer", "size": "xs"},
        ]

    # Carrier
    if carrier and status not in ("cancelled", "processing"):
        components += [
            {"type": "text", "id": "tr_carrier_lbl", "text": "Carrier", "style": "muted"},
            {"type": "text", "id": "tr_carrier_val", "text": carrier, "style": "paragraph"},
            {"type": "spacer", "size": "xs"},
        ]

    # Live tracking link — URL action opens in new tab
    if tracking and status in ("dispatched", "in_transit"):
        components += [
            {
                "type": "button", "id": "tr_track_btn",
                "label": "Track shipment →",
                "style": "link",
                "action": {"type": "url", "url": tracking},
            },
            {"type": "spacer", "size": "xs"},
        ]

    # Contextual hint
    hint = None
    if damage:
        hint = "⚠️ A damage claim is active on this order. Chat with us to check on its progress."
    elif cancellable:
        hint = "This order can still be cancelled. Use the Cancel an Order card to cancel it."
    elif status in ("dispatched", "in_transit") and tracking:
        hint = "Your order is on its way. Use the tracking link above to follow it in real time."
    elif status == "delivered":
        hint = "Order delivered. Need to start a return? Chat with us and have your order ID ready."
    elif status == "cancelled":
        hint = "This order was cancelled. If a refund is pending, allow 5–7 business days."

    if hint:
        components += [
            {"type": "divider"},
            {"type": "text", "id": "tr_hint", "text": hint, "style": "muted"},
            {"type": "spacer", "size": "xs"},
        ]

    components += [
        {"type": "divider"},
        {
            "type": "button", "id": "tracker_restart_btn",
            "label": "← Check another order",
            "style": "link",
            "action": {"type": "submit"},
        },
    ]

    return {"canvas": {"content": {"components": components}}}


def _tracker_not_found(raw):
    """Order Tracker — order ID not found screen."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text", "id": "tnf_hd",
                        "text": "Order not found",
                        "style": "header", "align": "center",
                    },
                    {"type": "spacer", "size": "xs"},
                    {
                        "type": "text", "id": "tnf_body",
                        "text": (
                            f"We couldn't find an order matching \"{raw.strip().upper()}\".\n\n"
                            "Order IDs look like ORD-10041 — check your confirmation email and try again."
                        ),
                        "style": "paragraph", "align": "center",
                    },
                    {"type": "spacer", "size": "s"},
                    {
                        "type": "button", "id": "tracker_restart_btn",
                        "label": "← Try again",
                        "style": "link",
                        "action": {"type": "submit"},
                    },
                ]
            }
        }
    }


def _tracker_empty():
    """Order Tracker — user submitted without entering an ID."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text", "id": "te_hd",
                        "text": "Please enter an order ID",
                        "style": "header", "align": "center",
                    },
                    {
                        "type": "text", "id": "te_body",
                        "text": "Type your order ID in the field below — it looks like ORD-10041.",
                        "style": "muted", "align": "center",
                    },
                    {"type": "spacer", "size": "s"},
                    {
                        "type": "input", "id": "tracker_order_id",
                        "label": "Order ID",
                        "placeholder": "e.g. ORD-10041",
                        "action": {"type": "submit"},
                    },
                    {"type": "spacer", "size": "xs"},
                    {
                        "type": "button", "id": "tracker_lookup_btn",
                        "label": "Check order status",
                        "style": "primary",
                        "action": {"type": "submit"},
                    },
                ]
            }
        }
    }


# ── Card 1 routes ─────────────────────────────────────────────────────────────

@app.route("/messenger/tracker/initialize", methods=["POST"])
def tracker_initialize():
    return jsonify(_tracker_home())


@app.route("/messenger/tracker/submit", methods=["POST"])
def tracker_submit():
    body         = request.get_json(silent=True) or {}
    component_id = body.get("component_id", "")
    input_values = body.get("input_values", {})

    # Back to home
    if component_id == "tracker_restart_btn":
        return jsonify(_tracker_home())

    # Get the order ID the user typed
    raw = (
        input_values.get("tracker_order_id", "")
        or input_values.get(component_id, "")
    ).strip()

    if not raw:
        return jsonify(_tracker_empty())

    normalized = _normalize_order_id(raw)
    order = ORDERS.get(normalized)

    if not order:
        return jsonify(_tracker_not_found(raw))

    return jsonify(_tracker_result(order))


# ─────────────────────────────────────────────────────────────────────────────
# CARD 2 — CANCEL AN ORDER
# ─────────────────────────────────────────────────────────────────────────────

# The five cancellation reasons the API accepts, paired with human-readable labels
_CANCEL_REASONS = [
    ("changed_my_mind",      "I changed my mind"),
    ("ordered_by_mistake",   "I ordered by mistake"),
    ("found_better_price",   "I found a better price"),
    ("delivery_too_slow",    "Delivery is too slow"),
    ("other",                "Other reason"),
]


def _cancel_home():
    """Cancel card — Step 1: enter order ID."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text", "id": "c_hd",
                        "text": "Cancel an order",
                        "style": "header", "align": "center",
                    },
                    {
                        "type": "text", "id": "c_sub",
                        "text": "Orders can only be cancelled before they are dispatched.",
                        "style": "muted", "align": "center",
                    },
                    {"type": "spacer", "size": "s"},
                    {
                        "type": "input", "id": "cancel_order_id",
                        "label": "Order ID",
                        "placeholder": "e.g. ORD-10041",
                        "action": {"type": "submit"},
                    },
                    {"type": "spacer", "size": "xs"},
                    {
                        "type": "button", "id": "cancel_lookup_btn",
                        "label": "Look up order",
                        "style": "primary",
                        "action": {"type": "submit"},
                    },
                ]
            }
        }
    }


def _cancel_confirm_screen(order):
    """
    Cancel card — Step 2: show order details + reason picker + confirm button.
    Only shown when the order is actually cancellable.
    """
    order_id  = order["order_id"]
    item_name = order["item_name"]
    qty       = order["qty"]
    price     = order["price_total"]
    est_del   = _fmt_date(order.get("estimated_delivery"))

    components = [
        {
            "type": "text", "id": "cc_hd",
            "text": "Confirm cancellation",
            "style": "header", "align": "center",
        },
        {"type": "divider"},
        {"type": "text", "id": "cc_oid_lbl", "text": "Order", "style": "muted"},
        {"type": "text", "id": "cc_oid_val", "text": order_id, "style": "paragraph"},
        {"type": "spacer", "size": "xs"},
        {"type": "text", "id": "cc_item_lbl", "text": "Item", "style": "muted"},
        {
            "type": "text", "id": "cc_item_val",
            "text": f"{item_name} × {qty}  ·  {price}",
            "style": "paragraph",
        },
        {"type": "spacer", "size": "xs"},
    ]

    if est_del:
        components += [
            {"type": "text", "id": "cc_eta_lbl", "text": "Estimated delivery", "style": "muted"},
            {"type": "text", "id": "cc_eta_val", "text": est_del, "style": "paragraph"},
            {"type": "spacer", "size": "xs"},
        ]

    components += [
        {"type": "divider"},
        # Reason picker — single-select dropdown
        {
            "type": "single-select",
            "id": "cancel_reason",
            "label": "Why are you cancelling?",
            "options": [
                {"type": "option", "id": reason_id, "text": label}
                for reason_id, label in _CANCEL_REASONS
            ],
        },
        {"type": "spacer", "size": "xs"},
        # Confirm button
        {
            "type": "button", "id": "cancel_confirm_btn",
            "label": "Cancel this order",
            "style": "primary",
            "action": {"type": "submit"},
        },
        {"type": "spacer", "size": "xs"},
        # Back link — passes order_id in component id so we can re-render
        {
            "type": "button", "id": "cancel_restart_btn",
            "label": "← Back",
            "style": "link",
            "action": {"type": "submit"},
        },
    ]

    return {"canvas": {"content": {"components": components}}}


def _cancel_success(order_id):
    """Cancel card — Step 3a: cancellation confirmed."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text", "id": "cs_hd",
                        "text": "✅ Order cancelled",
                        "style": "header", "align": "center",
                    },
                    {"type": "spacer", "size": "xs"},
                    {
                        "type": "text", "id": "cs_oid",
                        "text": order_id,
                        "style": "paragraph", "align": "center",
                    },
                    {"type": "divider"},
                    {
                        "type": "text", "id": "cs_refund",
                        "text": "Your refund will be returned to your original payment method within 5–7 business days. Your bank may take a further 2–5 business days to post the funds.",
                        "style": "paragraph",
                    },
                    {"type": "spacer", "size": "xs"},
                    {
                        "type": "text", "id": "cs_help",
                        "text": "Need more help? Start a chat below and our team will assist you.",
                        "style": "muted",
                    },
                    {"type": "spacer", "size": "s"},
                    {
                        "type": "button", "id": "cancel_restart_btn",
                        "label": "← Cancel another order",
                        "style": "link",
                        "action": {"type": "submit"},
                    },
                ]
            }
        }
    }


def _cancel_not_cancellable(order):
    """Cancel card — Step 3b: order cannot be cancelled, with specific reason."""
    status    = order["status"]
    order_id  = order["order_id"]
    item_name = order["item_name"]

    reason_map = {
        "delivered":    (
            "This order has already been delivered.",
            "If you'd like to return it, chat with us and have your order ID ready."
        ),
        "dispatched":   (
            "This order has already been dispatched and is on its way to you.",
            "You won't be able to cancel it now, but you can return it once it arrives."
        ),
        "in_transit":   (
            "This order is currently in transit.",
            "You won't be able to cancel it now, but you can return it once it arrives."
        ),
        "in_production": (
            "This is a made-to-order item and the 24-hour cancellation window has passed.",
            "Made-to-order cancellations after this window require agent review. Chat with us for help."
        ),
        "cancelled":    (
            "This order has already been cancelled.",
            "If you haven't received your refund, chat with us and we'll look into it."
        ),
    }

    heading, detail = reason_map.get(
        status,
        ("This order cannot be cancelled.", "Chat with us for more information.")
    )

    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text", "id": "cnc_hd",
                        "text": "Cannot cancel this order",
                        "style": "header", "align": "center",
                    },
                    {"type": "spacer", "size": "xs"},
                    {"type": "text", "id": "cnc_oid_lbl", "text": "Order", "style": "muted"},
                    {"type": "text", "id": "cnc_oid_val", "text": order_id, "style": "paragraph"},
                    {"type": "spacer", "size": "xs"},
                    {"type": "text", "id": "cnc_item_lbl", "text": "Item", "style": "muted"},
                    {"type": "text", "id": "cnc_item_val", "text": item_name, "style": "paragraph"},
                    {"type": "divider"},
                    {
                        "type": "text", "id": "cnc_reason",
                        "text": heading,
                        "style": "paragraph",
                    },
                    {"type": "spacer", "size": "xs"},
                    {
                        "type": "text", "id": "cnc_detail",
                        "text": detail,
                        "style": "muted",
                    },
                    {"type": "spacer", "size": "s"},
                    {
                        "type": "button", "id": "cancel_restart_btn",
                        "label": "← Try a different order",
                        "style": "link",
                        "action": {"type": "submit"},
                    },
                ]
            }
        }
    }


def _cancel_not_found(raw):
    """Cancel card — order ID not found screen."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text", "id": "cnf_hd",
                        "text": "Order not found",
                        "style": "header", "align": "center",
                    },
                    {"type": "spacer", "size": "xs"},
                    {
                        "type": "text", "id": "cnf_body",
                        "text": (
                            f"We couldn't find an order matching \"{raw.strip().upper()}\".\n\n"
                            "Order IDs look like ORD-10041 — check your confirmation email and try again."
                        ),
                        "style": "paragraph", "align": "center",
                    },
                    {"type": "spacer", "size": "s"},
                    {
                        "type": "button", "id": "cancel_restart_btn",
                        "label": "← Try again",
                        "style": "link",
                        "action": {"type": "submit"},
                    },
                ]
            }
        }
    }


def _cancel_empty():
    """Cancel card — user submitted without entering an ID."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text", "id": "cem_hd",
                        "text": "Please enter an order ID",
                        "style": "header", "align": "center",
                    },
                    {
                        "type": "text", "id": "cem_body",
                        "text": "Type your order ID in the field below — it looks like ORD-10041.",
                        "style": "muted", "align": "center",
                    },
                    {"type": "spacer", "size": "s"},
                    {
                        "type": "input", "id": "cancel_order_id",
                        "label": "Order ID",
                        "placeholder": "e.g. ORD-10041",
                        "action": {"type": "submit"},
                    },
                    {"type": "spacer", "size": "xs"},
                    {
                        "type": "button", "id": "cancel_lookup_btn",
                        "label": "Look up order",
                        "style": "primary",
                        "action": {"type": "submit"},
                    },
                ]
            }
        }
    }


def _cancel_no_reason():
    """Cancel card — confirm button pressed without selecting a reason."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text", "id": "cnr_hd",
                        "text": "Please select a reason",
                        "style": "header", "align": "center",
                    },
                    {
                        "type": "text", "id": "cnr_body",
                        "text": "Go back and choose a cancellation reason before confirming.",
                        "style": "muted", "align": "center",
                    },
                    {"type": "spacer", "size": "s"},
                    {
                        "type": "button", "id": "cancel_restart_btn",
                        "label": "← Go back",
                        "style": "link",
                        "action": {"type": "submit"},
                    },
                ]
            }
        }
    }


# ── Card 2 routes ─────────────────────────────────────────────────────────────

@app.route("/messenger/cancel/initialize", methods=["POST"])
def cancel_initialize():
    return jsonify(_cancel_home())


@app.route("/messenger/cancel/submit", methods=["POST"])
def cancel_submit():
    body         = request.get_json(silent=True) or {}
    component_id = body.get("component_id", "")
    input_values = body.get("input_values", {})

    # ── Back to home / restart ────────────────────────────────────────────
    if component_id == "cancel_restart_btn":
        return jsonify(_cancel_home())

    # ── Step 1 → Step 2: look up the order ───────────────────────────────
    if component_id in ("cancel_lookup_btn", "cancel_order_id"):
        raw = input_values.get("cancel_order_id", "").strip()
        if not raw:
            return jsonify(_cancel_empty())

        normalized = _normalize_order_id(raw)
        order = ORDERS.get(normalized)

        if not order:
            return jsonify(_cancel_not_found(raw))

        # Show confirm screen (with reason picker) if cancellable,
        # or the "cannot cancel" screen immediately if not.
        if order["cancellable"]:
            return jsonify(_cancel_confirm_screen(order))
        else:
            return jsonify(_cancel_not_cancellable(order))

    # ── Step 2 → Step 3: perform the cancellation ────────────────────────
    if component_id == "cancel_confirm_btn":
        # The order ID was on the previous canvas — retrieve it from
        # current_canvas stored_data or re-derive from input_values.
        # Because we don't use stored_data here, the safest approach is
        # to re-read the order ID from input_values (it persists across
        # canvases in the same session).
        raw_order_id = input_values.get("cancel_order_id", "").strip()
        reason       = input_values.get("cancel_reason", "").strip()

        if not raw_order_id:
            return jsonify(_cancel_home())

        if not reason or reason not in [r[0] for r in _CANCEL_REASONS]:
            return jsonify(_cancel_no_reason())

        normalized = _normalize_order_id(raw_order_id)
        order = ORDERS.get(normalized)

        if not order:
            return jsonify(_cancel_not_found(raw_order_id))

        if not order["cancellable"]:
            return jsonify(_cancel_not_cancellable(order))

        # Perform the cancellation directly on the in-memory data
        order["cancellable"] = False
        order["status"]      = "cancelled"

        return jsonify(_cancel_success(normalized))

    # ── Fallback: return to home ──────────────────────────────────────────
    return jsonify(_cancel_home())


# ─────────────────────────────────────────────────────────────────────────────
# STATIC FILE SERVING — catch-all, must stay AFTER all named routes above
# ─────────────────────────────────────────────────────────────────────────────
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
# MOCK DATA — ORDERS
# ─────────────────────────────────────────────────────────────────────────────
ORDERS = {
    "ORD-10041": {
        "order_id": "ORD-10041", "customer_id": "cust_001",
        "item_name": "Harlow Sofa (3-seater), Oatmeal", "qty": 1,
        "price_total": "$849.00", "status": "delivered",
        "placed_at": "2025-05-10T14:22:00-05:00", "dispatched_at": "2025-05-13T09:00:00-05:00",
        "estimated_delivery": "2025-05-18", "delivered_at": "2025-05-18",
        "shipping_method": "large_item", "shipping_cost": "$49.99",
        "carrier": "FedEx Freight", "tracking_number": "1Z999AA10123456784",
        "cancellable": False, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10042": {
        "order_id": "ORD-10042", "customer_id": "cust_001",
        "item_name": "Soy Wax Candle Set — Cedarwood & Amber (300g × 3)", "qty": 3,
        "price_total": "$89.00", "status": "in_transit",
        "placed_at": "2025-06-14T10:05:00-05:00", "dispatched_at": "2025-06-14T16:00:00-05:00",
        "estimated_delivery": "2025-06-20", "delivered_at": None,
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": "1Z999AA10123456785",
        "cancellable": False, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10043": {
        "order_id": "ORD-10043", "customer_id": "cust_001",
        "item_name": "Ridgeline Bookshelf, Walnut", "qty": 1,
        "price_total": "$215.00", "status": "processing",
        "placed_at": "2025-06-17T08:45:00-05:00", "dispatched_at": None,
        "estimated_delivery": "2025-06-24", "delivered_at": None,
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": None,
        "cancellable": True, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10044": {
        "order_id": "ORD-10044", "customer_id": "cust_001",
        "item_name": "Marble & Brass Side Table", "qty": 1,
        "price_total": "$189.00", "status": "cancelled",
        "placed_at": "2025-04-20T11:30:00-05:00", "dispatched_at": None,
        "estimated_delivery": None, "delivered_at": None,
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": None, "tracking_number": None,
        "cancellable": False, "damage_claim_active": False,
        "fin_note": "Order was cancelled at customer request before dispatch. Refund issued to original payment method.",
    },
    "ORD-10045": {
        "order_id": "ORD-10045", "customer_id": "cust_001",
        "item_name": "Stoneware Dinner Set (4-piece), Sage Green", "qty": 1,
        "price_total": "$89.00", "status": "delivered",
        "placed_at": "2025-03-05T09:00:00-05:00", "dispatched_at": "2025-03-06T10:00:00-05:00",
        "estimated_delivery": "2025-03-10", "delivered_at": "2025-03-10",
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": "1Z999AA10123456780",
        "cancellable": False, "damage_claim_active": False,
        "fin_note": (
            "Return window expired. Standard 30-day return window from delivery (2025-03-10) "
            "expired on 2025-04-09. Any return request for this order requires agent exception approval."
        ),
    },
    "ORD-10051": {
        "order_id": "ORD-10051", "customer_id": "cust_002",
        "item_name": "Elm Dining Table", "qty": 1,
        "price_total": "$429.00", "status": "dispatched",
        "placed_at": "2025-06-15T09:30:00-05:00", "dispatched_at": "2025-06-16T08:00:00-05:00",
        "estimated_delivery": "2025-06-23", "delivered_at": None,
        "shipping_method": "large_item", "shipping_cost": "$49.99",
        "carrier": "FedEx Freight", "tracking_number": "1Z999AA10123456786",
        "cancellable": False, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10052": {
        "order_id": "ORD-10052", "customer_id": "cust_002",
        "item_name": "Harlow Sofa (2-seater), Slate Grey", "qty": 1,
        "price_total": "$699.00", "status": "delivered",
        "placed_at": "2025-05-01T14:00:00-05:00", "dispatched_at": "2025-05-03T09:00:00-05:00",
        "estimated_delivery": "2025-05-09", "delivered_at": "2025-05-09",
        "shipping_method": "large_item", "shipping_cost": "$49.99",
        "carrier": "FedEx Freight", "tracking_number": "1Z999AA10123456787",
        "cancellable": False, "damage_claim_active": False,
        "fin_note": (
            "Return window expired. Furniture over $300 has a 14-day return window "
            "which elapsed on 2025-05-23. Agent exception required for any return."
        ),
    },
    "ORD-10053": {
        "order_id": "ORD-10053", "customer_id": "cust_002",
        "item_name": "Bamboo Storage Basket Set (3-pack)", "qty": 1,
        "price_total": "$55.00", "status": "processing",
        "placed_at": "2025-06-18T11:00:00-05:00", "dispatched_at": None,
        "estimated_delivery": "2025-06-25", "delivered_at": None,
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": None,
        "cancellable": True, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10054": {
        "order_id": "ORD-10054", "customer_id": "cust_002",
        "item_name": "Linen Throw Blanket, Terracotta", "qty": 2,
        "price_total": "$98.00", "status": "delivered",
        "placed_at": "2025-04-10T10:00:00-05:00", "dispatched_at": "2025-04-11T09:00:00-05:00",
        "estimated_delivery": "2025-04-15", "delivered_at": "2025-04-15",
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": "1Z999AA10123456788",
        "cancellable": False, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10055": {
        "order_id": "ORD-10055", "customer_id": "cust_002",
        "item_name": "Cast Iron Dutch Oven (5.5L) — Verde Kitchen", "qty": 1,
        "price_total": "$149.00", "status": "delivered",
        "placed_at": "2025-06-01T09:15:00-05:00", "dispatched_at": "2025-06-02T08:00:00-05:00",
        "estimated_delivery": "2025-06-05", "delivered_at": "2025-06-05",
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": "1Z999AA10123456790",
        "cancellable": False, "damage_claim_active": True,
        "fin_note": (
            "Active damage claim on this order. Customer reported cracked enamel coating "
            "on 2025-06-06 (within 48-hour window) with photos submitted. Claim status: "
            "under_review. Do not offer refund autonomously — escalate to Returns Team."
        ),
    },
    "ORD-10061": {
        "order_id": "ORD-10061", "customer_id": "cust_003",
        "item_name": "Stoneware Dinner Set (4-piece), Sage Green × 2", "qty": 2,
        "price_total": "$178.00", "status": "processing",
        "placed_at": "2025-06-17T08:45:00-05:00", "dispatched_at": None,
        "estimated_delivery": "2025-06-24", "delivered_at": None,
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": None,
        "cancellable": True, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10062": {
        "order_id": "ORD-10062", "customer_id": "cust_003",
        "item_name": "Velvet Accent Chair, Dusty Rose", "qty": 1,
        "price_total": "$320.00", "status": "delivered",
        "placed_at": "2025-05-20T13:00:00-05:00", "dispatched_at": "2025-05-22T09:00:00-05:00",
        "estimated_delivery": "2025-05-28", "delivered_at": "2025-05-28",
        "shipping_method": "large_item", "shipping_cost": "$49.99",
        "carrier": "FedEx Freight", "tracking_number": "1Z999AA10123456791",
        "cancellable": False, "damage_claim_active": False,
        "fin_note": (
            "Return window expired. Furniture over $300 has a 14-day return window "
            "which elapsed on 2025-06-11. Agent exception required for any return."
        ),
    },
    "ORD-10063": {
        "order_id": "ORD-10063", "customer_id": "cust_003",
        "item_name": "Scented Diffuser Set — Eucalyptus", "qty": 1,
        "price_total": "$45.00", "status": "cancelled",
        "placed_at": "2025-06-10T09:00:00-05:00", "dispatched_at": None,
        "estimated_delivery": None, "delivered_at": None,
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": None, "tracking_number": None,
        "cancellable": False, "damage_claim_active": False,
        "fin_note": "Order was cancelled at customer request before dispatch. Refund issued to original payment method.",
    },
    "ORD-10064": {
        "order_id": "ORD-10064", "customer_id": "cust_003",
        "item_name": "Elm Coffee Table", "qty": 1,
        "price_total": "$299.00", "status": "in_transit",
        "placed_at": "2025-06-13T10:30:00-05:00", "dispatched_at": "2025-06-14T09:00:00-05:00",
        "estimated_delivery": "2025-06-21", "delivered_at": None,
        "shipping_method": "large_item", "shipping_cost": "$49.99",
        "carrier": "FedEx Freight", "tracking_number": "1Z999AA10123456792",
        "cancellable": False, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10065": {
        "order_id": "ORD-10065", "customer_id": "cust_003",
        "item_name": "Ceramic Vase Set (3-piece), Matte White", "qty": 1,
        "price_total": "$72.00", "status": "delivered",
        "placed_at": "2025-06-01T08:00:00-05:00", "dispatched_at": "2025-06-02T08:00:00-05:00",
        "estimated_delivery": "2025-06-06", "delivered_at": "2025-06-06",
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": "1Z999AA10123456793",
        "cancellable": False, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10071": {
        "order_id": "ORD-10071", "customer_id": "cust_004",
        "item_name": "Ridgeline Bookshelf, Walnut", "qty": 1,
        "price_total": "$227.99", "status": "processing",
        "placed_at": "2025-06-17T13:55:00-05:00", "dispatched_at": None,
        "estimated_delivery": None, "delivered_at": None,
        "shipping_method": "standard", "shipping_cost": "$17.99",
        "carrier": "UPS", "tracking_number": None,
        "cancellable": True, "damage_claim_active": False,
        "fin_note": (
            "This order is shipping to Alaska. Standard AK surcharge of $12.00 has been "
            "applied (base $5.99 + $12.00 = $17.99). Express shipping is not available for AK/HI."
        ),
    },
    "ORD-10072": {
        "order_id": "ORD-10072", "customer_id": "cust_004",
        "item_name": "Linen Throw Blanket, Slate", "qty": 1,
        "price_total": "$57.99", "status": "delivered",
        "placed_at": "2025-05-15T09:00:00-05:00", "dispatched_at": "2025-05-16T10:00:00-05:00",
        "estimated_delivery": "2025-05-24", "delivered_at": "2025-05-24",
        "shipping_method": "standard", "shipping_cost": "$17.99",
        "carrier": "UPS", "tracking_number": "1Z999AA10123456794",
        "cancellable": False, "damage_claim_active": False,
        "fin_note": "AK order — standard surcharge applied at time of purchase.",
    },
    "ORD-10073": {
        "order_id": "ORD-10073", "customer_id": "cust_004",
        "item_name": "Bamboo Storage Basket Set (3-pack)", "qty": 2,
        "price_total": "$122.99", "status": "in_transit",
        "placed_at": "2025-06-12T11:00:00-05:00", "dispatched_at": "2025-06-13T08:00:00-05:00",
        "estimated_delivery": "2025-06-25", "delivered_at": None,
        "shipping_method": "standard", "shipping_cost": "$17.99",
        "carrier": "UPS", "tracking_number": "1Z999AA10123456795",
        "cancellable": False, "damage_claim_active": False,
        "fin_note": "AK order — standard surcharge applied. Express shipping not available.",
    },
    "ORD-10074": {
        "order_id": "ORD-10074", "customer_id": "cust_004",
        "item_name": "Ceramic Serving Bowl, Speckled Clay", "qty": 1,
        "price_total": "$61.99", "status": "cancelled",
        "placed_at": "2025-04-05T08:00:00-05:00", "dispatched_at": None,
        "estimated_delivery": None, "delivered_at": None,
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": None, "tracking_number": None,
        "cancellable": False, "damage_claim_active": False,
        "fin_note": "Order cancelled at customer request before dispatch. Refund issued to original payment method.",
    },
    "ORD-10075": {
        "order_id": "ORD-10075", "customer_id": "cust_004",
        "item_name": "Scented Candle — Firewood & Pine (400g)", "qty": 3,
        "price_total": "$107.97", "status": "delivered",
        "placed_at": "2025-03-20T10:00:00-05:00", "dispatched_at": "2025-03-21T09:00:00-05:00",
        "estimated_delivery": "2025-03-31", "delivered_at": "2025-03-31",
        "shipping_method": "standard", "shipping_cost": "$17.99",
        "carrier": "UPS", "tracking_number": "1Z999AA10123456796",
        "cancellable": False, "damage_claim_active": False,
        "fin_note": (
            "Return window expired. Standard 30-day return window from delivery (2025-03-31) "
            "expired on 2025-04-30. AK surcharge applied at time of purchase."
        ),
    },
    "ORD-10081": {
        "order_id": "ORD-10081", "customer_id": "cust_005",
        "item_name": "Marble & Brass Side Table", "qty": 1,
        "price_total": "$189.00", "status": "delivered",
        "placed_at": "2025-04-01T10:00:00-05:00", "dispatched_at": "2025-04-02T09:00:00-05:00",
        "estimated_delivery": "2025-04-07", "delivered_at": "2025-04-08",
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": "1Z999AA10123456789",
        "cancellable": False, "damage_claim_active": False,
        "fin_note": (
            "Return window expired. Standard 30-day return window from delivery (2025-04-08) "
            "expired on 2025-05-08. Any return request requires agent exception approval."
        ),
    },
    "ORD-10082": {
        "order_id": "ORD-10082", "customer_id": "cust_005",
        "item_name": "Velvet Accent Chair, Forest Green", "qty": 1,
        "price_total": "$320.00", "status": "in_transit",
        "placed_at": "2025-06-13T11:00:00-05:00", "dispatched_at": "2025-06-14T08:00:00-05:00",
        "estimated_delivery": "2025-06-21", "delivered_at": None,
        "shipping_method": "large_item", "shipping_cost": "$49.99",
        "carrier": "FedEx Freight", "tracking_number": "1Z999AA10123456797",
        "cancellable": False, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10083": {
        "order_id": "ORD-10083", "customer_id": "cust_005",
        "item_name": "Custom Linen Sofa — Sage (made to order)", "qty": 1,
        "price_total": "$1299.00", "status": "in_production",
        "placed_at": "2025-05-20T11:00:00-05:00", "dispatched_at": None,
        "estimated_delivery": "2025-06-24", "delivered_at": None,
        "shipping_method": "large_item", "shipping_cost": "$49.99",
        "carrier": None, "tracking_number": None,
        "cancellable": False, "damage_claim_active": False,
        "fin_note": (
            "This is a made-to-order item. The 24-hour cancellation window has elapsed — "
            "this order cannot be cancelled. Made-to-order items are not eligible for return "
            "unless defective. Do not confirm cancellation or return eligibility without "
            "escalating to an agent."
        ),
    },
    "ORD-10084": {
        "order_id": "ORD-10084", "customer_id": "cust_005",
        "item_name": "Ceramic Vase Set (3-piece), Blush", "qty": 1,
        "price_total": "$72.00", "status": "processing",
        "placed_at": "2025-06-18T14:00:00-05:00", "dispatched_at": None,
        "estimated_delivery": "2025-06-25", "delivered_at": None,
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": None,
        "cancellable": True, "damage_claim_active": False, "fin_note": None,
    },
    "ORD-10085": {
        "order_id": "ORD-10085", "customer_id": "cust_005",
        "item_name": "Stoneware Mug Set (4-piece), Charcoal", "qty": 1,
        "price_total": "$64.00", "status": "delivered",
        "placed_at": "2025-05-30T09:00:00-05:00", "dispatched_at": "2025-05-31T08:00:00-05:00",
        "estimated_delivery": "2025-06-04", "delivered_at": "2025-06-04",
        "shipping_method": "standard", "shipping_cost": "$0.00",
        "carrier": "UPS", "tracking_number": "1Z999AA10123456798",
        "cancellable": False, "damage_claim_active": False, "fin_note": None,
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — RETURNS
# ─────────────────────────────────────────────────────────────────────────────
RETURNS = {
    "RET-2201": {
        "return_id": "RET-2201", "order_id": "ORD-10041", "customer_id": "cust_001",
        "item_name": "Harlow Sofa (3-seater), Oatmeal",
        "reason": "item_not_as_described", "status": "return_received",
        "return_initiated": "2025-05-25", "return_received_date": "2025-05-30",
        "refund_status": "processing", "refund_amount": "$849.00",
        "refund_includes_shipping": True, "refund_estimated_date": "2025-06-06",
        "refund_issued_date": None, "refund_method": "original_payment_method",
        "return_shipping": "free", "requires_agent_escalation": True,
        "escalation_reason": "refund_overdue",
        "fin_note": (
            "OVERDUE: Refund was estimated by 2025-06-06 but has not been issued. "
            "Escalate to Billing Team immediately."
        ),
    },
    "RET-2202": {
        "return_id": "RET-2202", "order_id": "ORD-10042", "customer_id": "cust_001",
        "item_name": "Soy Wax Candle — Cedarwood & Amber (one unit, opened)",
        "reason": "change_of_mind", "status": "return_requested",
        "return_initiated": "2025-06-16", "return_received_date": None,
        "refund_status": "pending", "refund_amount": None,
        "refund_includes_shipping": False, "refund_estimated_date": None,
        "refund_issued_date": None, "refund_method": "original_payment_method",
        "return_shipping": "$8.00 estimated",
        "fin_note": (
            "INELIGIBLE — opened candles are not returnable under NestKart policy. "
            "This return_requested status is an error state from a prematurely submitted "
            "request. Fin must inform the customer that opened candles cannot be returned "
            "and escalate to an agent to close this return request."
        ),
    },
    "RET-2203": {
        "return_id": "RET-2203", "order_id": "ORD-10055", "customer_id": "cust_002",
        "item_name": "Cast Iron Dutch Oven (5.5L) — Verde Kitchen",
        "reason": "damaged_on_arrival", "status": "under_review",
        "return_initiated": "2025-06-06", "return_received_date": None,
        "refund_status": "pending", "refund_amount": "$149.00",
        "refund_includes_shipping": True, "refund_estimated_date": None,
        "refund_issued_date": None, "refund_method": "original_payment_method",
        "return_shipping": "free", "refund_locked": True,
        "refund_locked_reason": "damage_claim_under_review",
        "fin_note": (
            "Damage claim under review by Returns Team. Photos received. "
            "Do not confirm refund amount or timeline to customer until review is complete. "
            "Escalate if customer is pressing for resolution — this exceeds Fin's autonomous "
            "refund authority as the claim is unverified."
        ),
    },
}

DYNAMIC_RETURNS = {}
_return_id_counter = [2204]

# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — PAYMENT METHODS
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
    return jsonify({"ok": False, "error": error_code, "message": message}), status


def ownership_error(provided_customer_id, actual_customer_id):
    if provided_customer_id != actual_customer_id:
        return jsonify({
            "ok": False, "error": "ownership_mismatch",
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
    current = start_date
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5:
            added += 1
    return current


def tracking_url(tracking_number):
    if tracking_number:
        return f"https://track.nestkart.com/{tracking_number}"
    return None


def parse_price(price_str):
    if not price_str:
        return None
    try:
        return float(price_str.replace("$", "").replace(",", ""))
    except (ValueError, AttributeError):
        return None


def _return_eligibility(order_id):
    order = ORDERS.get(order_id, {})
    status = order.get("status")

    if status in ("processing", "dispatched", "in_transit", "in_production"):
        if "made to order" in order.get("item_name", "").lower() or (not order.get("cancellable") and status == "in_production"):
            return {
                "eligible": False,
                "reason": "This is a made-to-order item. Made-to-order items are not eligible for return unless defective.",
                "return_window_days": None, "return_window_expires_on": None,
                "days_remaining": None, "return_shipping_cost": "free (defective items only)",
                "item_condition_requirements": "N/A — made-to-order items are non-returnable unless defective.",
                "fin_note": (
                    "Made-to-order items are not returnable unless defective. "
                    "Do not confirm return eligibility without escalating to an agent."
                ),
            }
        return {
            "eligible": False,
            "reason": "Order has not yet been delivered. Return can only be initiated after confirmed delivery.",
            "return_window_days": 30, "return_window_expires_on": None,
            "days_remaining": None,
            "return_shipping_cost": "$8.00–$15.00 estimated (customer pays — change of mind); free if defective",
            "item_condition_requirements": "Unused, in original packaging.",
            "fin_note": "Order has not yet been delivered. Return eligibility cannot be confirmed until delivery is complete.",
        }

    if status == "cancelled":
        return {
            "eligible": False, "reason": "Order was cancelled and cannot be returned.",
            "return_window_days": None, "return_window_expires_on": None,
            "days_remaining": None, "return_shipping_cost": None,
            "item_condition_requirements": None,
            "fin_note": "Order is cancelled. No return is possible — a refund was issued at cancellation.",
        }

    if order.get("damage_claim_active"):
        return {
            "eligible": True,
            "reason": "Item was reported damaged on arrival. Active damage claim under review.",
            "return_window_days": 30, "return_window_expires_on": None,
            "days_remaining": None, "return_shipping_cost": "free",
            "item_condition_requirements": "Item must be in received condition. Original packaging preferred.",
            "refund_locked": True, "refund_locked_reason": "damage_claim_under_review",
            "fin_note": (
                "Active damage claim under review. Do not confirm refund amount or final "
                "timeline until the Returns Team completes their review."
            ),
        }

    delivered_at = order.get("delivered_at")
    price_val = parse_price(order.get("price_total"))
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
                "return_window_days": window_days,
                "return_window_expires_on": expiry_date.isoformat(),
                "days_remaining": 0,
                "return_shipping_cost": "$8.00–$15.00 estimated (customer pays)",
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
                "return_window_days": window_days,
                "return_window_expires_on": expiry_date.isoformat(),
                "days_remaining": days_remaining,
                "return_shipping_cost": "free (defect/description mismatch); $8.00–$15.00 customer pays (change of mind)",
                "item_condition_requirements": "Unused, in original packaging.",
                "fin_note": None,
            }

    return {
        "eligible": False,
        "reason": "Return eligibility could not be determined for this order.",
        "return_window_days": None, "return_window_expires_on": None,
        "days_remaining": None, "return_shipping_cost": None,
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
    api_key  = request.headers.get("X-Api-Key", "")
    auth_hdr = request.headers.get("Authorization", "")
    bearer_tok = auth_hdr[len("Bearer "):] if auth_hdr.startswith("Bearer ") else ""
    if api_key == VALID_API_KEY or bearer_tok == VALID_BEARER:
        return
    return jsonify({
        "ok": False, "error": "unauthorized",
        "message": "A valid X-Api-Key header or Authorization Bearer token is required.",
    }), 401


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN A — ORDERS & TRACKING
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/orders/<order_id>", methods=["GET"])
def get_order(order_id):
    order = ORDERS.get(order_id)
    if not order:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)
    t_number = order.get("tracking_number")
    t_url = tracking_url(t_number)
    resp = {
        "ok": True, "order_id": order["order_id"], "customer_id": order["customer_id"],
        "status": order["status"], "item_name": order["item_name"], "qty": order["qty"],
        "price_total": order["price_total"], "shipping_method": order["shipping_method"],
        "shipping_cost": order["shipping_cost"], "carrier": order.get("carrier"),
        "tracking_number": t_number, "tracking_url": t_url,
        "tracking_url_note": "Mock URL — not a live carrier link." if t_url else None,
        "placed_at": order["placed_at"], "dispatched_at": order.get("dispatched_at"),
        "estimated_delivery": order.get("estimated_delivery"),
        "delivered_at": order.get("delivered_at"), "cancellable": order["cancellable"],
    }
    if order.get("damage_claim_active"):
        resp["damage_claim_active"] = True
    if order.get("fin_note"):
        resp["fin_note"] = order["fin_note"]
    return jsonify(resp)


@app.route("/api/customers/<customer_id>/orders", methods=["GET"])
def get_customer_orders(customer_id):
    if customer_id not in CUSTOMERS:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)
    orders = sorted(
        [o for o in ORDERS.values() if o["customer_id"] == customer_id],
        key=lambda o: o["placed_at"], reverse=True,
    )
    return jsonify({
        "ok": True, "customer_id": customer_id, "total_orders": len(orders),
        "orders": [
            {
                "order_id": o["order_id"], "status": o["status"],
                "item_summary": o["item_name"], "placed_at": o["placed_at"],
                "estimated_delivery": o.get("estimated_delivery"), "price_total": o["price_total"],
            }
            for o in orders
        ],
    })


@app.route("/api/orders/<order_id>/cancel", methods=["POST"])
def cancel_order(order_id):
    order = ORDERS.get(order_id)
    if not order:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)
    body = request.get_json(silent=True) or {}
    customer_id = body.get("customer_id")
    reason = body.get("reason")
    if not customer_id:
        return err("missing_field", "Required field 'customer_id' is missing.", 400)
    ownership_err = ownership_error(customer_id, order["customer_id"])
    if ownership_err:
        return ownership_err
    ACCEPTED_CANCEL_REASONS = ["changed_my_mind", "ordered_by_mistake", "found_better_price", "delivery_too_slow", "other"]
    if not reason:
        return err("missing_field", "Required field 'reason' is missing.", 400)
    if reason not in ACCEPTED_CANCEL_REASONS:
        return err("invalid_reason", f"Invalid reason '{reason}'. Accepted values: {', '.join(ACCEPTED_CANCEL_REASONS)}.", 400)
    if not order["cancellable"]:
        status = order["status"]
        cancel_error = (
            "order_already_delivered" if status == "delivered"
            else "order_already_dispatched" if status in ("dispatched", "in_transit")
            else "made_to_order_cancellation_window_elapsed" if status == "in_production"
            else "order_not_cancellable"
        )
        return jsonify({
            "ok": False, "cancelled": False, "reason": cancel_error,
            "fin_note": (
                "Inform the customer that their order cannot be cancelled. "
                "If dispatched, they may return it after delivery. "
                "If made-to-order, the 24-hour window has elapsed — escalate to an agent."
            ),
        }), 200
    return jsonify({
        "ok": True, "cancelled": True, "order_id": order_id,
        "refund_method": "original_payment_method",
        "refund_timeline": "5–7 business days to your original payment method, plus 2–5 business days for your bank to process.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN B — RETURNS & REFUNDS
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/orders/<order_id>/return-eligibility", methods=["GET"])
def return_eligibility(order_id):
    if order_id not in ORDERS:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)
    elig = _return_eligibility(order_id)
    return jsonify({"ok": True, "order_id": order_id, **elig})


@app.route("/api/orders/<order_id>/returns", methods=["POST"])
def initiate_return(order_id):
    if order_id not in ORDERS:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)
    order = ORDERS[order_id]
    body = request.get_json(silent=True) or {}
    customer_id = body.get("customer_id")
    reason = body.get("reason")
    condition = body.get("condition")
    has_original_pkg = body.get("has_original_packaging")
    ACCEPTED_RETURN_REASONS = ["change_of_mind", "item_not_as_described", "damaged_on_arrival", "defective", "wrong_item_received"]
    ACCEPTED_CONDITIONS = ["unused", "opened", "assembled"]
    missing = [f for f, v in [("customer_id", customer_id), ("reason", reason), ("condition", condition)] if v is None]
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
    elig = _return_eligibility(order_id)
    if not elig["eligible"]:
        return jsonify({"ok": False, "eligible": False, "reason": elig["reason"], "fin_note": elig.get("fin_note")}), 200
    return_id = f"RET-{_return_id_counter[0]}"
    _return_id_counter[0] += 1
    today = date.today()
    refund_eta = add_business_days(today, 7)
    free_return = elig["return_shipping_cost"] == "free"
    incl_shipping = reason in ("damaged_on_arrival", "defective", "wrong_item_received", "item_not_as_described")
    DYNAMIC_RETURNS[return_id] = {
        "return_id": return_id, "order_id": order_id, "customer_id": customer_id,
        "item_name": order["item_name"], "reason": reason, "condition": condition,
        "has_original_packaging": has_original_pkg, "status": "return_requested",
        "return_initiated": today.isoformat(), "return_received_date": None,
        "refund_status": "pending", "refund_amount": None,
        "refund_includes_shipping": incl_shipping, "refund_estimated_date": refund_eta.isoformat(),
        "refund_issued_date": None, "refund_method": "original_payment_method",
        "return_shipping": "free" if free_return else elig["return_shipping_cost"],
        "fin_note": None,
    }
    resp = {
        "ok": True, "return_id": return_id, "status": "return_requested",
        "instructions": (
            "Please repack the item securely in its original packaging and attach the "
            "return label to the outside of the box. Drop it off at any UPS location within 14 days."
        ),
        "return_shipping_cost": "free" if free_return else elig["return_shipping_cost"],
        "estimated_refund_date": refund_eta.isoformat(),
        "refund_bank_note": "Once NestKart processes your refund, allow an additional 2–5 business days for your bank to post the funds.",
    }
    if free_return:
        resp["return_shipping_label_url"] = f"https://returns.nestkart.com/label/{return_id}"
    return jsonify(resp)


@app.route("/api/returns/<return_id>", methods=["GET"])
def get_return(return_id):
    ret = RETURNS.get(return_id) or DYNAMIC_RETURNS.get(return_id)
    if not ret:
        return err("return_not_found", f"No return found with ID '{return_id}'.", 404)
    resp = {
        "ok": True, "return_id": ret["return_id"], "order_id": ret["order_id"],
        "item_name": ret["item_name"], "reason": ret["reason"], "status": ret["status"],
        "return_initiated": ret["return_initiated"], "return_received_date": ret.get("return_received_date"),
        "refund_status": ret["refund_status"], "refund_amount": ret.get("refund_amount"),
        "refund_includes_shipping": ret.get("refund_includes_shipping"),
        "refund_method": ret["refund_method"], "refund_estimated_date": ret.get("refund_estimated_date"),
        "refund_issued_date": ret.get("refund_issued_date"),
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
    cust = CUSTOMERS.get(customer_id)
    if not cust:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)
    payment = PAYMENT_METHODS.get(customer_id)
    ak_hi = cust["state"] in ("AK", "HI")
    fin_notes = []
    if ak_hi:
        fin_notes.append(
            "This customer is in AK/HI. Standard shipping surcharge +$12 applies. "
            "Large item surcharge +$75 applies. Express shipping is not available for AK/HI."
        )
    if payment and payment["is_expired"]:
        fin_notes.append("Customer's saved payment method is expired. Flag this if they are placing or modifying an order.")
    resp = {
        "ok": True, "customer_id": cust["customer_id"], "name": cust["name"],
        "email": cust["email"], "account_created": cust["account_created"],
        "marketing_opt_in": cust["marketing_opt_in"], "state": cust["state"],
        "ak_hi_customer": ak_hi,
        "payment_method": {
            "type": payment["type"], "last_four": payment["last_four"],
            "expiry_month": payment["expiry_month"], "expiry_year": payment["expiry_year"],
            "is_expired": payment["is_expired"],
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
    print(f"NestKart Mock API v4.0.0 — listening on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
