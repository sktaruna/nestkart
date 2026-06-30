"""
================================================================================
NestKart — Canvas Kit: Reschedule Delivery
================================================================================
Messenger Home app — 4-screen flow:

  Screen 1  HOME        — Landing card with "Reschedule a Delivery" button
  Screen 2  ORDER LIST  — Eligible orders (processing / dispatched), or empty state
  Screen 3  CALENDAR    — Month grid; available weekday slots highlighted
  Screen 4  CONFIRM     — Success confirmation

HOW TO LINK THIS FILE INTO app.py
  1. Copy canvas.py into the same folder as app.py.
  2. Add this import near the top of app.py, after `app = Flask(__name__)`:

         from canvas import canvas_bp
         app.register_blueprint(canvas_bp)

  3. That's it — the two routes below become live:
         POST /messenger/initialize
         POST /messenger/submit

INTERCOM DEVELOPER HUB SETUP
  In your app's Developer Hub → Configure → Canvas Kit →
  "For users, leads and visitors" → Messenger Home:
    • Initialize flow webhook URL  →  https://<your-railway-url>/messenger/initialize
    • Submit flow webhook URL      →  https://<your-railway-url>/messenger/submit

THEME
  Matches NestKart palette:
    Accent gold  #B08450
    Dark text    #1A1A1A
    Muted        #6B6458
    Surface      #FAF8F5
    Border       #E5DDD5
    White        #FFFFFF
================================================================================
"""

import calendar
from datetime import date, timedelta
from flask import Blueprint, request, jsonify

# ── import shared helpers from app.py ──────────────────────────────────────────
# canvas.py is imported AFTER app.py defines these, so the import works fine.
from app import ORDERS, CUSTOMERS, STATUS_OVERRIDES, get_order_status, weekday_slots

canvas_bp = Blueprint("canvas", __name__)

# ─────────────────────────────────────────────────────────────────────────────
# THEME CONSTANTS  (NestKart palette)
# ─────────────────────────────────────────────────────────────────────────────
COLOR_ACCENT  = "#B08450"   # warm gold — primary action buttons
COLOR_DARK    = "#1A1A1A"   # main text
COLOR_MUTED   = "#6B6458"   # secondary text
COLOR_SURFACE = "#FAF8F5"   # warm off-white background
COLOR_BORDER  = "#E5DDD5"   # subtle separator
COLOR_WHITE   = "#FFFFFF"
COLOR_SUCCESS = "#4A7C59"   # confirmation green

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_date(iso: str) -> str:
    """'2025-07-01' → 'Tue, 1 Jul'"""
    d = date.fromisoformat(iso)
    return d.strftime("%-d %b").lstrip("0")  # e.g. "1 Jul"

def _fmt_date_long(iso: str) -> str:
    """'2025-07-01' → 'Tuesday, 1 July 2025'"""
    d = date.fromisoformat(iso)
    return d.strftime("%A, %-d %B %Y")

def _item_summary(items: list) -> str:
    """[{product_name, qty}, ...] → 'Linen Cloud Sofa × 1, Ceramic Vessel Set × 2'"""
    return ", ".join(f"{i['product_name']} × {i['qty']}" for i in items)

def _fmt_inr(amount) -> str:
    """89999 → '₹89,999'"""
    s = str(int(amount))
    if len(s) <= 3:
        return f"₹{s}"
    result = s[-3:]
    s = s[:-3]
    while s:
        result = s[-2:] + "," + result
        s = s[:-2]
    return f"₹{result}"

def _get_customer_id(payload: dict) -> str | None:
    """
    Extract customer_id from Intercom Messenger initialize/submit payload.
    Intercom sends the user_id you set at boot — which is the customer_id.
    """
    # Messenger payloads: contact.user_id  or  user.user_id
    contact = payload.get("contact") or payload.get("user") or {}
    return contact.get("user_id") or contact.get("id")

def _reschedule_eligible_orders(customer_id: str) -> list:
    """Return orders for customer that can be rescheduled (processing or dispatched)."""
    eligible = []
    for order in ORDERS.values():
        if order["customer_id"] != customer_id:
            continue
        status = get_order_status(order)
        if status in ("processing", "dispatched"):
            eligible.append(order)
    # Most recent first
    eligible.sort(key=lambda o: o["placed_at"], reverse=True)
    return eligible


# ─────────────────────────────────────────────────────────────────────────────
# CANVAS BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def _canvas_home() -> dict:
    """
    Screen 1 — Messenger Home landing card.
    Shows the NestKart wordmark, a short line, and one CTA button.
    """
    return {
        "canvas": {
            "content": {
                "components": [
                    # ── Header ──────────────────────────────────────────────
                    {
                        "type": "text",
                        "text": "NestKart",
                        "style": "header",
                        "align": "center",
                    },
                    {
                        "type": "text",
                        "text": "Need to change your delivery date?",
                        "style": "paragraph",
                        "align": "center",
                    },
                    # ── Divider ─────────────────────────────────────────────
                    {"type": "divider"},
                    # ── CTA button ──────────────────────────────────────────
                    {
                        "type": "button",
                        "id": "start_reschedule",
                        "label": "Reschedule a Delivery →",
                        "style": "primary",
                        "action": {"type": "submit"},
                    },
                ]
            },
            "stored_data": {"screen": "home"},
        }
    }


def _canvas_order_list(eligible_orders: list) -> dict:
    """
    Screen 2a — List of orders eligible for rescheduling.
    Each order rendered as a button the customer taps to pick.
    """
    components = [
        {
            "type": "text",
            "text": "Select an order to reschedule",
            "style": "header",
        },
        {
            "type": "text",
            "text": "These orders are eligible for a new delivery date.",
            "style": "muted",
        },
        {"type": "divider"},
    ]

    for order in eligible_orders:
        order_id = order["order_id"]
        status   = get_order_status(order)
        summary  = _item_summary(order["items"])
        total    = _fmt_inr(order["price_total"])
        est_del  = _fmt_date(order["estimated_delivery"])

        # Order detail text block
        components.append({
            "type": "text",
            "text": f"*{order_id}*  ·  {status.replace('_', ' ').title()}",
            "style": "paragraph",
        })
        components.append({
            "type": "text",
            "text": f"{summary}\n{total}  ·  Est. {est_del}",
            "style": "muted",
        })
        # Tap to select this order
        components.append({
            "type": "button",
            "id": f"select_order_{order_id}",
            "label": f"Choose this order",
            "style": "secondary",
            "action": {"type": "submit"},
        })
        components.append({"type": "spacer", "size": "s"})

    return {
        "canvas": {
            "content": {"components": components},
            "stored_data": {"screen": "order_list"},
        }
    }


def _canvas_no_orders() -> dict:
    """Screen 2b — No eligible orders."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text",
                        "text": "No orders to reschedule",
                        "style": "header",
                    },
                    {
                        "type": "text",
                        "text": (
                            "You don't have any orders that can be rescheduled right now. "
                            "Only orders that are being processed or dispatched are eligible."
                        ),
                        "style": "paragraph",
                    },
                    {"type": "divider"},
                    {
                        "type": "text",
                        "text": "Need help with something else? Our team is here Mon–Sat, 9 am–7 pm IST.",
                        "style": "muted",
                    },
                    {
                        "type": "button",
                        "id": "done_no_orders",
                        "label": "Done",
                        "style": "secondary",
                        "action": {"type": "submit"},
                    },
                ]
            },
            "stored_data": {"screen": "no_orders"},
        }
    }


def _canvas_calendar(order_id: str, available_slots: list) -> dict:
    """
    Screen 3 — Calendar grid for the current month.

    Renders a 7-column (Mon–Sun) grid as a DataTable.
    Available slots are shown as tappable buttons.
    Past / weekend / unavailable dates show as muted plain text.
    The customer taps an available date → triggers submit with component_id = "slot_<date>".
    """
    order    = ORDERS[order_id]
    est_del  = _fmt_date_long(order["estimated_delivery"])
    summary  = _item_summary(order["items"])

    slot_set = set(available_slots)

    # ── Build calendar grid ───────────────────────────────────────────────────
    today    = date.today()
    # Use the month of the first available slot (could be next month if today is late)
    first_slot = date.fromisoformat(available_slots[0]) if available_slots else today
    year, month = first_slot.year, first_slot.month

    # Calendar grid: list of weeks, each week = 7 days (Mon=0 … Sun=6)
    # calendar.monthcalendar returns rows of [Mon..Sun]; 0 = not in this month
    cal_weeks = calendar.monthcalendar(year, month)

    month_label = date(year, month, 1).strftime("%B %Y")   # e.g. "July 2025"

    # ── Components ───────────────────────────────────────────────────────────
    components = [
        {
            "type": "text",
            "text": f"Reschedule delivery — {order_id}",
            "style": "header",
        },
        {
            "type": "text",
            "text": f"{summary}\nCurrently due: {est_del}",
            "style": "muted",
        },
        {"type": "divider"},
        {
            "type": "text",
            "text": f"*{month_label}* — tap an available date",
            "style": "paragraph",
        },
    ]

    # ── Day-header row ────────────────────────────────────────────────────────
    # Canvas Kit DataTable: columns defined as list of header strings,
    # rows as list of lists (one cell per column).
    DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    rows = []
    for week in cal_weeks:
        row = []
        for col_idx, day_num in enumerate(week):
            if day_num == 0:
                # Outside this month — blank cell
                row.append({"type": "text", "text": " "})
                continue

            cell_date = date(year, month, day_num)
            iso       = cell_date.isoformat()
            day_str   = str(day_num)

            if iso in slot_set:
                # ✅ Available — render as a tappable button
                row.append({
                    "type": "button",
                    "id": f"slot_{iso}",
                    "label": day_str,
                    "style": "primary",
                    "action": {"type": "submit"},
                })
            elif col_idx >= 5:
                # Weekend — muted
                row.append({
                    "type": "text",
                    "text": day_str,
                    "style": "muted",
                    "align": "center",
                })
            elif cell_date <= today:
                # Past date — muted
                row.append({
                    "type": "text",
                    "text": day_str,
                    "style": "muted",
                    "align": "center",
                })
            else:
                # Future weekday but not a slot (outside the 14-day window) — grey
                row.append({
                    "type": "text",
                    "text": day_str,
                    "style": "muted",
                    "align": "center",
                })
        rows.append(row)

    components.append({
        "type": "data-table",
        "items": {
            "type": "attribute-list",
            "items": [
                {
                    "type": "row",
                    # Column headers
                    "items": [
                        {"type": "text", "text": h, "style": "muted", "align": "center"}
                        for h in DAY_HEADERS
                    ],
                }
            ]
            + [
                {
                    "type": "row",
                    "items": row,
                }
                for row in rows
            ],
        },
    })

    components += [
        {"type": "spacer", "size": "s"},
        {
            "type": "text",
            "text": "Highlighted dates are available for delivery. Weekends are not available.",
            "style": "muted",
        },
    ]

    return {
        "canvas": {
            "content": {"components": components},
            "stored_data": {
                "screen": "calendar",
                "order_id": order_id,
                "slots": available_slots,
            },
        }
    }


def _canvas_confirmation(order_id: str, new_date_iso: str) -> dict:
    """Screen 4 — Reschedule confirmed."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text",
                        "text": "Delivery rescheduled ✓",
                        "style": "header",
                        "align": "center",
                    },
                    {
                        "type": "text",
                        "text": f"Order *{order_id}* is now scheduled for",
                        "style": "paragraph",
                        "align": "center",
                    },
                    {
                        "type": "text",
                        "text": _fmt_date_long(new_date_iso),
                        "style": "header",
                        "align": "center",
                    },
                    {"type": "divider"},
                    {
                        "type": "text",
                        "text": (
                            "You'll receive a confirmation message shortly. "
                            "If you need to make any other changes, contact us at "
                            "orders@nestkart.in or call +91 90012 34567."
                        ),
                        "style": "muted",
                    },
                    {
                        "type": "button",
                        "id": "done_confirmed",
                        "label": "Done",
                        "style": "primary",
                        "action": {"type": "submit"},
                    },
                ]
            },
            "stored_data": {"screen": "confirmed"},
        },
        "event": {"type": "completed"},
    }


def _canvas_error(message: str) -> dict:
    """Generic error screen."""
    return {
        "canvas": {
            "content": {
                "components": [
                    {
                        "type": "text",
                        "text": "Something went wrong",
                        "style": "header",
                    },
                    {
                        "type": "text",
                        "text": message,
                        "style": "paragraph",
                    },
                    {
                        "type": "text",
                        "text": "Please try again or contact us at orders@nestkart.in.",
                        "style": "muted",
                    },
                    {
                        "type": "button",
                        "id": "error_retry",
                        "label": "Start over",
                        "style": "secondary",
                        "action": {"type": "submit"},
                    },
                ]
            },
            "stored_data": {"screen": "error"},
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@canvas_bp.route("/messenger/initialize", methods=["POST"])
def messenger_initialize():
    """
    Called by Intercom when the user opens the Messenger Home app.
    Always returns Screen 1 (the landing card).
    """
    return jsonify(_canvas_home())


@canvas_bp.route("/messenger/submit", methods=["POST"])
def messenger_submit():
    """
    Called whenever a button with action.type = "submit" is tapped.

    Routing logic:
      • component_id == "start_reschedule"   → load order list (Screen 2)
      • component_id == "select_order_<ID>"  → load calendar for that order (Screen 3)
      • component_id == "slot_<YYYY-MM-DD>"  → confirm reschedule (Screen 4)
      • component_id == "done_*" / "error_retry" → back to home (Screen 1)
    """
    payload      = request.get_json(silent=True) or {}
    component_id = payload.get("component_id", "")
    stored       = (payload.get("current_canvas") or {}).get("stored_data") or {}
    screen       = stored.get("screen", "home")
    customer_id  = _get_customer_id(payload)

    # ── CTA on home card: show order list ─────────────────────────────────────
    if component_id == "start_reschedule":
        if not customer_id:
            return jsonify(_canvas_error("We couldn't identify your account. Please sign in and try again."))
        eligible = _reschedule_eligible_orders(customer_id)
        if not eligible:
            return jsonify(_canvas_no_orders())
        return jsonify(_canvas_order_list(eligible))

    # ── Order selected: show calendar ─────────────────────────────────────────
    if component_id.startswith("select_order_"):
        order_id = component_id[len("select_order_"):]
        if order_id not in ORDERS:
            return jsonify(_canvas_error(f"Order {order_id} was not found."))
        slots = weekday_slots()
        if not slots:
            return jsonify(_canvas_error("No delivery slots are available right now. Please try again tomorrow."))
        return jsonify(_canvas_calendar(order_id, slots))

    # ── Slot selected: confirm reschedule ─────────────────────────────────────
    if component_id.startswith("slot_"):
        new_date  = component_id[len("slot_"):]        # "YYYY-MM-DD"
        order_id  = stored.get("order_id")
        valid_slots = stored.get("slots", [])

        if not order_id or order_id not in ORDERS:
            return jsonify(_canvas_error("Could not find the selected order."))
        if new_date not in valid_slots:
            return jsonify(_canvas_error("That date is no longer available. Please select another."))

        order  = ORDERS[order_id]
        status = get_order_status(order)
        if status not in ("processing", "dispatched"):
            return jsonify(_canvas_error(
                f"Order {order_id} can no longer be rescheduled (status: {status.replace('_', ' ')})."
            ))

        # ── Commit the reschedule ───────────────────────────────────────────
        order["estimated_delivery"] = new_date
        return jsonify(_canvas_confirmation(order_id, new_date))

    # ── Terminal buttons (Done / Start over) → back to home ──────────────────
    if component_id in ("done_no_orders", "done_confirmed", "error_retry"):
        return jsonify(_canvas_home())

    # ── Fallback: unknown component ───────────────────────────────────────────
    return jsonify(_canvas_home())
