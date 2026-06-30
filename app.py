"""
================================================================================
NestKart Mock API Server — v4.0.0
================================================================================
Full-stack rebuild: Flask backend + static HTML serving.
All data is hardcoded in-memory. Resets on server restart.

INSTALL:
    pip install flask flask-cors gunicorn

RUN LOCALLY:
    python app.py
    Server starts on http://0.0.0.0:5050

AUTHENTICATION:
    All /api/* routes require one of:
        X-Api-Key: nk-fin-dev-key-2025
        Authorization: Bearer nk-bearer-dev-token-2025

    /admin/* routes require NO auth (demo only).

TEST IDs:
    Customers : cust_001 · cust_002 · cust_003 · cust_004 · cust_005
    Orders    : ORD-10101 onwards (seeded at boot)
    Runtime order IDs start from ORD-10200
    Returns   : RET-2201 · RET-2202 · RET-2203 (seeded) + RET-2210 onwards (runtime)
================================================================================
"""

import os
from datetime import datetime, date, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────────────────────────────────────
# AUTH CONFIG
# ─────────────────────────────────────────────────────────────────────────────
VALID_API_KEY = "nk-fin-dev-key-2025"
VALID_BEARER  = "nk-bearer-dev-token-2025"

# ─────────────────────────────────────────────────────────────────────────────
# STATIC FILE SERVING
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    if '.' in filename and not filename.startswith('api') and not filename.startswith('admin/'):
        return send_from_directory('.', filename)
    return jsonify({"error": "not_found"}), 404

# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — CUSTOMERS
# ─────────────────────────────────────────────────────────────────────────────
CUSTOMERS = {
    "cust_001": {
        "customer_id": "cust_001",
        "name": "Priya Sharma",
        "email": "taruna2004126@gmail.com",
        "phone": "+91 98100 12345",
        "account_created": "2024-03-10",
        "marketing_opt_in": True,
        "state": "NY",  # kept for Fin fin_note AK/HI logic
        "address": {
            "street": "14, Lodhi Colony",
            "city": "New Delhi",
            "state": "Delhi",
            "pincode": "110003"
        }
    },
    "cust_002": {
        "customer_id": "cust_002",
        "name": "Arjun Mehta",
        "email": "11182tarunask@gmail.com",
        "phone": "+91 90220 67890",
        "account_created": "2023-11-22",
        "marketing_opt_in": False,
        "state": "CA",
        "address": {
            "street": "42, Bandra West, Linking Road",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400050"
        }
    },
    "cust_003": {
        "customer_id": "cust_003",
        "name": "Kavitha Nair",
        "email": "tarunask.1806@gmail.com",
        "phone": "+91 94430 55678",
        "account_created": "2025-01-05",
        "marketing_opt_in": True,
        "state": "TX",
        "address": {
            "street": "8, Indiranagar, 100 Feet Road",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560038"
        }
    },
    "cust_004": {
        "customer_id": "cust_004",
        "name": "Rohit Verma",
        "email": "taruna.stockmarket@gmail.com",
        "phone": "+91 98765 43210",
        "account_created": "2024-08-19",
        "marketing_opt_in": False,
        "state": "AK",
        "address": {
            "street": "22, Sector 17, Chandigarh",
            "city": "Chandigarh",
            "state": "Punjab",
            "pincode": "160017"
        }
    },
    "cust_005": {
        "customer_id": "cust_005",
        "name": "Anika Rossi",
        "email": "taruna2210569@ssn.edu.in",
        "phone": "+91 91000 88888",
        "account_created": "2024-12-01",
        "marketing_opt_in": True,
        "state": "CA",
        "address": {
            "street": "5, Alipore Road",
            "city": "Kolkata",
            "state": "West Bengal",
            "pincode": "700027"
        }
    },
}

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
# MOCK DATA — PRODUCTS
# ─────────────────────────────────────────────────────────────────────────────
PRODUCTS = {
    "prod_001": {
        "product_id": "prod_001",
        "name": "Linen Cloud Sofa",
        "category": "living",
        "price": 89999,
        "original_price": None,
        "stock": 8,
        "shipping_type": "large_item",
        "image_url": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=700&q=80",
        "badge": None,
        "description": "A generously cushioned sofa in breathable natural linen — made for long afternoons."
    },
    "prod_002": {
        "product_id": "prod_002",
        "name": "Velvet Accent Chair",
        "category": "living",
        "price": 32500,
        "original_price": None,
        "stock": 5,
        "shipping_type": "large_item",
        "image_url": "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=700&q=80",
        "badge": None,
        "description": "A striking accent chair in rich velvet with solid walnut legs — a statement piece that earns its place."
    },
    "prod_003": {
        "product_id": "prod_003",
        "name": "Teak Slab Dining Table",
        "category": "dining",
        "price": 124000,
        "original_price": None,
        "stock": 3,
        "shipping_type": "large_item",
        "image_url": "https://images.unsplash.com/photo-1617806118233-18e1de247200?w=700&q=80",
        "badge": None,
        "description": "Solid teak slab with live-edge detailing — each table is unique, built to last a lifetime."
    },
    "prod_004": {
        "product_id": "prod_004",
        "name": "Cloud Linen Bed Set",
        "category": "bedroom",
        "price": 14500,
        "original_price": None,
        "stock": 12,
        "shipping_type": "standard",
        "image_url": "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=700&q=80",
        "badge": None,
        "description": "Stone-washed linen bedding that gets softer with every wash — your bed will never feel the same."
    },
    "prod_005": {
        "product_id": "prod_005",
        "name": "Rattan Lounge Chair",
        "category": "living",
        "price": 21500,
        "original_price": 28000,
        "stock": 2,
        "shipping_type": "large_item",
        "image_url": "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=700&q=80",
        "badge": "Sale",
        "description": "Handwoven rattan with a deep seat cushion — perfect for a sunny corner or reading nook."
    },
    "prod_006": {
        "product_id": "prod_006",
        "name": "Walnut Platform Bed",
        "category": "bedroom",
        "price": 68000,
        "original_price": None,
        "stock": 4,
        "shipping_type": "large_item",
        "image_url": "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=700&q=80",
        "badge": None,
        "description": "A low-profile platform bed in solid walnut — clean lines, quiet elegance, no box spring needed."
    },
    "prod_007": {
        "product_id": "prod_007",
        "name": "Jute Woven Floor Lamp",
        "category": "lighting",
        "price": 18500,
        "original_price": None,
        "stock": 7,
        "shipping_type": "standard",
        "image_url": "https://images.pexels.com/photos/29559655/pexels-photo-29559655.jpeg?auto=compress&cs=tinysrgb&w=700",
        "badge": None,
        "description": "A tall floor lamp with a hand-wrapped jute shade that casts the warmest evening glow."
    },
    "prod_008": {
        "product_id": "prod_008",
        "name": "Ceramic Vessel Set",
        "category": "decor",
        "price": 4200,
        "original_price": None,
        "stock": 15,
        "shipping_type": "standard",
        "image_url": "https://images.pexels.com/photos/4611612/pexels-photo-4611612.jpeg?auto=compress&cs=tinysrgb&w=700",
        "badge": None,
        "description": "A trio of wheel-thrown ceramic vessels in matte sand — beautiful empty, even better with dried stems."
    },
    "prod_009": {
        "product_id": "prod_009",
        "name": "Linen Dining Chair Set of 2",
        "category": "dining",
        "price": 22000,
        "original_price": None,
        "stock": 6,
        "shipping_type": "large_item",
        "image_url": "https://images.pexels.com/photos/6312360/pexels-photo-6312360.jpeg?auto=compress&cs=tinysrgb&w=700",
        "badge": None,
        "description": "Paired dining chairs in natural linen with oak frames — understated, refined, built for gathering."
    },
    "prod_010": {
        "product_id": "prod_010",
        "name": "Washi Paper Pendant",
        "category": "lighting",
        "price": 8800,
        "original_price": None,
        "stock": 9,
        "shipping_type": "standard",
        "image_url": "https://images.pexels.com/photos/698907/pexels-photo-698907.jpeg?auto=compress&cs=tinysrgb&w=700",
        "badge": "New",
        "description": "A Japanese washi paper pendant that diffuses light beautifully — lightweight, sculptural, serene."
    },
    "prod_011": {
        "product_id": "prod_011",
        "name": "Handwoven Wool Rug 6×9 ft",
        "category": "living",
        "price": 26500,
        "original_price": None,
        "stock": 3,
        "shipping_type": "standard",
        "image_url": "https://images.pexels.com/photos/12199846/pexels-photo-12199846.jpeg?auto=compress&cs=tinysrgb&w=700",
        "badge": "New",
        "description": "Handwoven by artisans in Rajasthan — dense wool pile in warm, earthy tones that anchor any room."
    },
    "prod_012": {
        "product_id": "prod_012",
        "name": "Terracotta Planter Trio",
        "category": "decor",
        "price": 3600,
        "original_price": None,
        "stock": 20,
        "shipping_type": "standard",
        "image_url": "https://images.pexels.com/photos/9707245/pexels-photo-9707245.jpeg?auto=compress&cs=tinysrgb&w=700",
        "badge": None,
        "description": "Three hand-thrown terracotta planters in graduated sizes — classic, breathable, effortlessly pretty."
    },
    "prod_013": {
        "product_id": "prod_013",
        "name": "Sheesham Wood Bookshelf",
        "category": "living",
        "price": 34500,
        "original_price": None,
        "stock": 0,
        "shipping_type": "large_item",
        "image_url": "https://images.pexels.com/photos/2883049/pexels-photo-2883049.jpeg?auto=compress&cs=tinysrgb&w=700",
        "badge": None,
        "description": "A solid sheesham bookshelf with open shelving and a lower cabinet — sturdy, honest, beautiful."
    },
    "prod_014": {
        "product_id": "prod_014",
        "name": "Brass Table Lamp",
        "category": "lighting",
        "price": 12800,
        "original_price": None,
        "stock": 1,
        "shipping_type": "standard",
        "image_url": "https://images.pexels.com/photos/4577650/pexels-photo-4577650.jpeg?auto=compress&cs=tinysrgb&w=700",
        "badge": None,
        "description": "A slender brass table lamp with a linen drum shade — warm, timeless, and endlessly versatile."
    },
    "prod_015": {
        "product_id": "prod_015",
        "name": "Mango Wood Side Table",
        "category": "living",
        "price": 9800,
        "original_price": None,
        "stock": 8,
        "shipping_type": "standard",
        "image_url": "https://images.pexels.com/photos/11112739/pexels-photo-11112739.jpeg?auto=compress&cs=tinysrgb&w=700",
        "badge": "New",
        "description": "A compact round side table in solid mango wood with a natural finish — the perfect companion piece."
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA — PRODUCT REVIEWS
# ─────────────────────────────────────────────────────────────────────────────
PRODUCT_REVIEWS = {
    "prod_001": [
        {"reviewer": "Meera K.", "rating": 5, "comment": "Absolutely stunning sofa — the linen is so soft and the cushions are heavenly.", "date": "2025-04-12"},
        {"reviewer": "Ananya S.", "rating": 4, "comment": "Great quality and delivery was prompt. Slight colour difference from photos but still beautiful.", "date": "2025-03-28"},
        {"reviewer": "Priyanka R.", "rating": 5, "comment": "Worth every rupee. This sofa has transformed our living room.", "date": "2025-05-02"},
        {"reviewer": "Rahul M.", "rating": 4, "comment": "Comfortable and well-made. Assembly was straightforward.", "date": "2025-05-15"},
    ],
    "prod_002": [
        {"reviewer": "Divya N.", "rating": 5, "comment": "The velvet is so rich and the walnut legs are gorgeous. Perfect statement chair.", "date": "2025-04-18"},
        {"reviewer": "Siddharth P.", "rating": 3, "comment": "Good chair but the velvet picks up pet hair easily. Still very stylish.", "date": "2025-03-10"},
        {"reviewer": "Lakshmi T.", "rating": 5, "comment": "Love this chair. It is exactly as described and looks stunning in my study.", "date": "2025-05-20"},
    ],
    "prod_003": [
        {"reviewer": "Vikram A.", "rating": 5, "comment": "The live-edge detail is breathtaking. A true centrepiece for our dining room.", "date": "2025-02-14"},
        {"reviewer": "Sunita B.", "rating": 4, "comment": "Incredibly solid table. Delivery team handled it with care. Would buy again.", "date": "2025-03-05"},
        {"reviewer": "Amit C.", "rating": 5, "comment": "Six of us sat around it comfortably. Quality is exceptional.", "date": "2025-04-01"},
    ],
    "prod_004": [
        {"reviewer": "Pooja G.", "rating": 5, "comment": "The softest bedding I have ever slept in. Gets better with every wash.", "date": "2025-05-10"},
        {"reviewer": "Neha H.", "rating": 4, "comment": "Beautiful linen, very breathable. Delivery was quick.", "date": "2025-04-22"},
        {"reviewer": "Riya J.", "rating": 5, "comment": "Exactly what our bedroom needed. Timeless and luxurious.", "date": "2025-03-30"},
        {"reviewer": "Aishwarya L.", "rating": 4, "comment": "Lovely quality. True linen feel. Happy with the purchase.", "date": "2025-02-28"},
    ],
    "prod_005": [
        {"reviewer": "Karan M.", "rating": 5, "comment": "The rattan work is impeccable. Looks even better in person.", "date": "2025-05-01"},
        {"reviewer": "Smita N.", "rating": 4, "comment": "Very comfortable. The sale price was incredible value.", "date": "2025-04-14"},
        {"reviewer": "Tanvi O.", "rating": 3, "comment": "Nice chair but cushion could be thicker. Still a good buy.", "date": "2025-03-20"},
    ],
    "prod_006": [
        {"reviewer": "Varun P.", "rating": 5, "comment": "The walnut grain is stunning. Exactly the low-profile look we wanted.", "date": "2025-04-08"},
        {"reviewer": "Shilpa Q.", "rating": 5, "comment": "Perfect bed frame. Rock solid and incredibly beautiful.", "date": "2025-05-03"},
        {"reviewer": "Deepak R.", "rating": 4, "comment": "Great quality. Delivery was a bit delayed but worth the wait.", "date": "2025-03-15"},
    ],
    "prod_007": [
        {"reviewer": "Ishaan S.", "rating": 5, "comment": "The warmest, most atmospheric light. Our living room feels like a retreat now.", "date": "2025-04-25"},
        {"reviewer": "Pallavi T.", "rating": 4, "comment": "Beautiful lamp. The jute shade is even nicer in person.", "date": "2025-03-18"},
        {"reviewer": "Manish U.", "rating": 5, "comment": "Perfect for my reading corner. The light quality is wonderful.", "date": "2025-05-08"},
    ],
    "prod_008": [
        {"reviewer": "Gayatri V.", "rating": 5, "comment": "These vessels are so beautiful. I have them on every shelf.", "date": "2025-05-12"},
        {"reviewer": "Suresh W.", "rating": 4, "comment": "Lovely ceramics. Great quality for the price.", "date": "2025-04-30"},
        {"reviewer": "Asha X.", "rating": 5, "comment": "Gorgeous set. Used them as vases and they look stunning.", "date": "2025-03-22"},
    ],
    "prod_009": [
        {"reviewer": "Rohini Y.", "rating": 4, "comment": "Very well made chairs. The linen is high quality and the oak frames are solid.", "date": "2025-04-20"},
        {"reviewer": "Naveen Z.", "rating": 5, "comment": "These pair beautifully with our dining table. Very elegant.", "date": "2025-05-05"},
        {"reviewer": "Chitra A.", "rating": 4, "comment": "Good chairs. Comfortable for long dinners.", "date": "2025-03-28"},
    ],
    "prod_010": [
        {"reviewer": "Arun B.", "rating": 5, "comment": "Magical light quality. The washi paper creates the most beautiful glow.", "date": "2025-05-18"},
        {"reviewer": "Saranya C.", "rating": 5, "comment": "So elegant. Exactly what I was looking for above my dining table.", "date": "2025-04-10"},
        {"reviewer": "Vijay D.", "rating": 4, "comment": "Beautiful pendant. Lightweight and easy to install.", "date": "2025-03-14"},
    ],
    "prod_011": [
        {"reviewer": "Meena E.", "rating": 5, "comment": "The craftsmanship on this rug is extraordinary. Worth every rupee.", "date": "2025-04-16"},
        {"reviewer": "Rajan F.", "rating": 4, "comment": "Lovely colours and very plush underfoot. Anchors the room perfectly.", "date": "2025-05-06"},
        {"reviewer": "Usha G.", "rating": 5, "comment": "Bought as a gift — the recipient was overjoyed. Beautiful workmanship.", "date": "2025-03-25"},
    ],
    "prod_012": [
        {"reviewer": "Harish H.", "rating": 5, "comment": "These planters are perfect. Classic terracotta that works with everything.", "date": "2025-05-14"},
        {"reviewer": "Kamala I.", "rating": 4, "comment": "Nice quality. My plants seem happier in these than in plastic pots.", "date": "2025-04-28"},
        {"reviewer": "Ravi J.", "rating": 5, "comment": "Beautiful set. Exactly what our balcony needed.", "date": "2025-03-10"},
    ],
    "prod_013": [
        {"reviewer": "Geeta K.", "rating": 5, "comment": "Stunning bookshelf. The sheesham grain is so rich and warm.", "date": "2025-02-20"},
        {"reviewer": "Mohan L.", "rating": 4, "comment": "Very solid and well finished. Easy to assemble.", "date": "2025-03-08"},
        {"reviewer": "Padma M.", "rating": 4, "comment": "Love it. Wish it had one more shelf but overall excellent.", "date": "2025-04-05"},
    ],
    "prod_014": [
        {"reviewer": "Sanjay N.", "rating": 5, "comment": "The brass finish is perfect. Adds such warmth to our bedroom.", "date": "2025-05-07"},
        {"reviewer": "Hema O.", "rating": 4, "comment": "Elegant lamp. The linen shade is a perfect match.", "date": "2025-04-23"},
        {"reviewer": "Kritika P.", "rating": 5, "comment": "Exactly as pictured. The light it casts is so cosy.", "date": "2025-03-17"},
    ],
    "prod_015": [
        {"reviewer": "Sunil Q.", "rating": 5, "comment": "Perfect little side table. The mango wood has such a lovely grain.", "date": "2025-05-19"},
        {"reviewer": "Rekha R.", "rating": 4, "comment": "Great quality for the price. Sturdy and looks beautiful.", "date": "2025-04-27"},
        {"reviewer": "Nitin S.", "rating": 5, "comment": "Love the natural finish. It goes with everything in our living room.", "date": "2025-03-31"},
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# STOCK SNAPSHOT — used to restore on /admin/reset
# ─────────────────────────────────────────────────────────────────────────────
_ORIGINAL_STOCK = {pid: p["stock"] for pid, p in PRODUCTS.items()}

# ─────────────────────────────────────────────────────────────────────────────
# FLEXIBLE IN-MEMORY STATE
# ─────────────────────────────────────────────────────────────────────────────
ORDERS = {}
CARTS = {}
DYNAMIC_RETURNS = {}
STATUS_OVERRIDES = {}
_order_counter = [10200]   # runtime order IDs start at ORD-10200
_return_counter = [2210]   # runtime return IDs start at RET-2210

# ─────────────────────────────────────────────────────────────────────────────
# SEEDED RETURNS
# ─────────────────────────────────────────────────────────────────────────────
RETURNS = {
    "RET-2201": {
        "return_id": "RET-2201", "order_id": "ORD-10101", "customer_id": "cust_001",
        "item_name": "Linen Cloud Sofa",
        "reason": "item_not_as_described", "status": "return_received",
        "return_initiated": "2025-05-25", "return_received_date": "2025-05-30",
        "refund_status": "processing", "refund_amount": "₹89,999",
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
        "return_id": "RET-2202", "order_id": "ORD-10102", "customer_id": "cust_001",
        "item_name": "Ceramic Vessel Set",
        "reason": "change_of_mind", "status": "return_requested",
        "return_initiated": "2025-06-16", "return_received_date": None,
        "refund_status": "pending", "refund_amount": None,
        "refund_includes_shipping": False, "refund_estimated_date": None,
        "refund_issued_date": None, "refund_method": "original_payment_method",
        "return_shipping": "₹200 estimated", "refund_locked": True,
        "refund_locked_reason": "non_returnable_item",
        "fin_note": (
            "INELIGIBLE — this item was opened and used. Opened ceramics are not returnable "
            "under NestKart policy. This return_requested status is an error state. "
            "Inform the customer and escalate to an agent to close this return request."
        ),
    },
    "RET-2203": {
        "return_id": "RET-2203", "order_id": "ORD-10201", "customer_id": "cust_002",
        "item_name": "Teak Slab Dining Table",
        "reason": "damaged_on_arrival", "status": "under_review",
        "return_initiated": "2025-06-06", "return_received_date": None,
        "refund_status": "pending", "refund_amount": "₹1,24,000",
        "refund_includes_shipping": True, "refund_estimated_date": None,
        "refund_issued_date": None, "refund_method": "original_payment_method",
        "return_shipping": "free", "refund_locked": True,
        "refund_locked_reason": "damage_claim_under_review",
        "requires_agent_escalation": True,
        "fin_note": (
            "Damage claim under review by Returns Team. Photos received. "
            "Do not confirm refund amount or timeline until review is complete. "
            "Escalate if customer is pressing for resolution."
        ),
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# ORDER STATUS — DERIVED, NEVER STORED
# ─────────────────────────────────────────────────────────────────────────────
def get_order_status(order):
    if order.get("cancelled"):
        return "cancelled"
    if order["order_id"] in STATUS_OVERRIDES:
        return STATUS_OVERRIDES[order["order_id"]]
    placed_at = order["placed_at"]
    if isinstance(placed_at, str):
        placed_at = datetime.fromisoformat(placed_at)
    elapsed_minutes = (datetime.now() - placed_at).total_seconds() / 60
    if elapsed_minutes < 10:
        return "processing"
    elif elapsed_minutes < 30:
        return "dispatched"
    elif elapsed_minutes < 90:
        return "in_transit"
    else:
        return "delivered"

def is_cancellable(order):
    return get_order_status(order) == "processing"

def tracking_info(order):
    status = get_order_status(order)
    if status in ("dispatched", "in_transit", "delivered"):
        tn = order.get("tracking_number") or f"NK{order['order_id'].replace('ORD-', '')}TRACK"
        return tn, f"https://track.nestkart.com/{tn}"
    return None, None

def derive_stock_status(stock):
    if stock == 0:
        return "out_of_stock"
    elif stock <= 3:
        return "low_stock"
    else:
        return "in_stock"

def format_inr(amount):
    """Format integer as ₹1,24,000"""
    s = str(int(amount))
    if len(s) <= 3:
        return f"₹{s}"
    # Indian numbering: last 3 digits, then groups of 2
    result = s[-3:]
    s = s[:-3]
    while s:
        result = s[-2:] + "," + result
        s = s[:-2]
    return f"₹{result}"

def weekday_slots():
    """Return 7 weekday delivery dates starting tomorrow, within +14 days."""
    slots = []
    d = date.today() + timedelta(days=1)
    limit = date.today() + timedelta(days=14)
    while len(slots) < 7 and d <= limit:
        if d.weekday() < 5:  # Mon-Fri
            slots.append(d.isoformat())
        d += timedelta(days=1)
    return slots

def add_business_days(start_date, days):
    current = start_date
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5:
            added += 1
    return current

# ─────────────────────────────────────────────────────────────────────────────
# SEED ORDERS — called at boot; also called by /admin/reset
# ─────────────────────────────────────────────────────────────────────────────
_SEED_ORDER_IDS = set()

def _seed_orders():
    global ORDERS, _SEED_ORDER_IDS
    now = datetime.now()

    seeded = {
        # ── cust_001 (Priya Sharma) ───────────────────────────────────────────
        "ORD-10101": {
            "order_id": "ORD-10101", "customer_id": "cust_001",
            "items": [
                {"product_id": "prod_001", "product_name": "Linen Cloud Sofa",
                 "qty": 1, "unit_price": 89999, "line_total": 89999}
            ],
            "price_total": 89999,
            "placed_at": now - timedelta(days=3),
            "shipping_method": "large_item",
            "estimated_delivery": (now - timedelta(days=3) + timedelta(days=10)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_001"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": "NK10101TRACK",
            "fin_note": None,
        },
        "ORD-10102": {
            "order_id": "ORD-10102", "customer_id": "cust_001",
            "items": [
                {"product_id": "prod_008", "product_name": "Ceramic Vessel Set",
                 "qty": 2, "unit_price": 4200, "line_total": 8400}
            ],
            "price_total": 8400,
            "placed_at": now - timedelta(minutes=20),
            "shipping_method": "standard",
            "estimated_delivery": (now + timedelta(days=5)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_001"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": None,
            "fin_note": None,
        },
        "ORD-10103": {
            "order_id": "ORD-10103", "customer_id": "cust_001",
            "items": [
                {"product_id": "prod_012", "product_name": "Terracotta Planter Trio",
                 "qty": 1, "unit_price": 3600, "line_total": 3600},
                {"product_id": "prod_015", "product_name": "Mango Wood Side Table",
                 "qty": 1, "unit_price": 9800, "line_total": 9800},
            ],
            "price_total": 13400,
            "placed_at": now - timedelta(minutes=5),
            "shipping_method": "standard",
            "estimated_delivery": (now + timedelta(days=5)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_001"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": None,
            "fin_note": None,
        },

        # ── cust_002 (Arjun Mehta) ────────────────────────────────────────────
        "ORD-10201": {
            "order_id": "ORD-10201", "customer_id": "cust_002",
            "items": [
                {"product_id": "prod_003", "product_name": "Teak Slab Dining Table",
                 "qty": 1, "unit_price": 124000, "line_total": 124000}
            ],
            "price_total": 124000,
            "placed_at": now - timedelta(days=3),
            "shipping_method": "large_item",
            "estimated_delivery": (now - timedelta(days=3) + timedelta(days=10)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_002"]["address"]),
            "damage_claim_active": True,
            "cancelled": False,
            "tracking_number": "NK10201TRACK",
            "fin_note": (
                "Active damage claim on this order. Customer reported a crack in the slab "
                "on delivery. Claim status: under_review. Do not offer autonomous refund — "
                "escalate to Returns Team."
            ),
        },
        "ORD-10202": {
            "order_id": "ORD-10202", "customer_id": "cust_002",
            "items": [
                {"product_id": "prod_009", "product_name": "Linen Dining Chair Set of 2",
                 "qty": 1, "unit_price": 22000, "line_total": 22000}
            ],
            "price_total": 22000,
            "placed_at": now - timedelta(minutes=20),
            "shipping_method": "large_item",
            "estimated_delivery": (now + timedelta(days=10)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_002"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": None,
            "fin_note": None,
        },
        "ORD-10203": {
            "order_id": "ORD-10203", "customer_id": "cust_002",
            "items": [
                {"product_id": "prod_011", "product_name": "Handwoven Wool Rug 6×9 ft",
                 "qty": 1, "unit_price": 26500, "line_total": 26500}
            ],
            "price_total": 26500,
            "placed_at": now - timedelta(minutes=5),
            "shipping_method": "standard",
            "estimated_delivery": (now + timedelta(days=5)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_002"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": None,
            "fin_note": None,
        },

        # ── cust_003 (Kavitha Nair) ───────────────────────────────────────────
        "ORD-10301": {
            "order_id": "ORD-10301", "customer_id": "cust_003",
            "items": [
                {"product_id": "prod_006", "product_name": "Walnut Platform Bed",
                 "qty": 1, "unit_price": 68000, "line_total": 68000}
            ],
            "price_total": 68000,
            "placed_at": now - timedelta(days=3),
            "shipping_method": "large_item",
            "estimated_delivery": (now - timedelta(days=3) + timedelta(days=10)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_003"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": "NK10301TRACK",
            "fin_note": None,
        },
        "ORD-10302": {
            "order_id": "ORD-10302", "customer_id": "cust_003",
            "items": [
                {"product_id": "prod_004", "product_name": "Cloud Linen Bed Set",
                 "qty": 2, "unit_price": 14500, "line_total": 29000}
            ],
            "price_total": 29000,
            "placed_at": now - timedelta(minutes=20),
            "shipping_method": "standard",
            "estimated_delivery": (now + timedelta(days=5)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_003"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": None,
            "fin_note": None,
        },

        # ── cust_004 (Rohit Verma) ────────────────────────────────────────────
        "ORD-10401": {
            "order_id": "ORD-10401", "customer_id": "cust_004",
            "items": [
                {"product_id": "prod_002", "product_name": "Velvet Accent Chair",
                 "qty": 1, "unit_price": 32500, "line_total": 32500}
            ],
            "price_total": 32500,
            "placed_at": now - timedelta(days=3),
            "shipping_method": "large_item",
            "estimated_delivery": (now - timedelta(days=3) + timedelta(days=10)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_004"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": "NK10401TRACK",
            "fin_note": (
                "This customer is in AK/HI (state flag). Standard shipping surcharge applies. "
                "Express shipping is not available."
            ),
        },
        "ORD-10402": {
            "order_id": "ORD-10402", "customer_id": "cust_004",
            "items": [
                {"product_id": "prod_007", "product_name": "Jute Woven Floor Lamp",
                 "qty": 1, "unit_price": 18500, "line_total": 18500},
                {"product_id": "prod_010", "product_name": "Washi Paper Pendant",
                 "qty": 1, "unit_price": 8800, "line_total": 8800},
            ],
            "price_total": 27300,
            "placed_at": now - timedelta(minutes=5),
            "shipping_method": "standard",
            "estimated_delivery": (now + timedelta(days=5)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_004"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": None,
            "fin_note": (
                "AK/HI customer — standard surcharge applies. Express shipping not available."
            ),
        },

        # ── cust_005 (Anika Rossi) ────────────────────────────────────────────
        "ORD-10501": {
            "order_id": "ORD-10501", "customer_id": "cust_005",
            "items": [
                {"product_id": "prod_001", "product_name": "Linen Cloud Sofa",
                 "qty": 1, "unit_price": 89999, "line_total": 89999},
                {"product_id": "prod_006", "product_name": "Walnut Platform Bed",
                 "qty": 1, "unit_price": 68000, "line_total": 68000},
            ],
            "price_total": 157999,
            "placed_at": now - timedelta(days=3),
            "shipping_method": "large_item",
            "estimated_delivery": (now - timedelta(days=3) + timedelta(days=10)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_005"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": "NK10501TRACK",
            "fin_note": (
                "Customer's saved payment method (Mastercard ••8888) is expired. "
                "Flag this if they are placing or modifying an order requiring payment."
            ),
        },
        "ORD-10502": {
            "order_id": "ORD-10502", "customer_id": "cust_005",
            "items": [
                {"product_id": "prod_005", "product_name": "Rattan Lounge Chair",
                 "qty": 1, "unit_price": 21500, "line_total": 21500}
            ],
            "price_total": 21500,
            "placed_at": now - timedelta(minutes=20),
            "shipping_method": "large_item",
            "estimated_delivery": (now + timedelta(days=10)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_005"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": None,
            "fin_note": None,
        },
        "ORD-10503": {
            "order_id": "ORD-10503", "customer_id": "cust_005",
            "items": [
                {"product_id": "prod_008", "product_name": "Ceramic Vessel Set",
                 "qty": 1, "unit_price": 4200, "line_total": 4200},
                {"product_id": "prod_012", "product_name": "Terracotta Planter Trio",
                 "qty": 1, "unit_price": 3600, "line_total": 3600},
            ],
            "price_total": 7800,
            "placed_at": now - timedelta(minutes=5),
            "shipping_method": "standard",
            "estimated_delivery": (now + timedelta(days=5)).date().isoformat(),
            "delivery_address": dict(CUSTOMERS["cust_005"]["address"]),
            "damage_claim_active": False,
            "cancelled": False,
            "tracking_number": None,
            "fin_note": None,
        },
    }
    ORDERS.update(seeded)
    _SEED_ORDER_IDS.update(seeded.keys())


_seed_orders()

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def err(error_code, message, status=400):
    return jsonify({"ok": False, "error": error_code, "message": message}), status

def ownership_error(provided_id, actual_id):
    if provided_id != actual_id:
        return jsonify({
            "ok": False, "error": "ownership_mismatch",
            "message": "The provided customer_id does not match the verified owner of this resource.",
            "fin_note": "Do not retry with a different customer_id. Re-confirm the customer's identity.",
        }), 403
    return None

def _build_order_response(order):
    status = get_order_status(order)
    tn, t_url = tracking_info(order)
    items = order.get("items", [])
    return {
        "ok": True,
        "order_id": order["order_id"],
        "customer_id": order["customer_id"],
        "items": items,
        "price_total": order["price_total"],
        "price_total_formatted": format_inr(order["price_total"]),
        "placed_at": order["placed_at"].isoformat() if isinstance(order["placed_at"], datetime) else order["placed_at"],
        "status": status,
        "shipping_method": order["shipping_method"],
        "estimated_delivery": order.get("estimated_delivery"),
        "delivery_address": order.get("delivery_address"),
        "damage_claim_active": order.get("damage_claim_active", False),
        "cancellable": status == "processing",
        "tracking_number": tn,
        "tracking_url": t_url,
        "fin_note": order.get("fin_note"),
    }

def _return_eligibility_check(order_id):
    order = ORDERS.get(order_id, {})
    status = get_order_status(order)

    if status in ("processing", "dispatched", "in_transit"):
        return {
            "eligible": False,
            "reason": "Order has not yet been delivered. Return can only be initiated after confirmed delivery.",
            "return_window_days": 30, "return_window_expires_on": None,
            "days_remaining": None, "return_shipping_cost": "₹200–₹500 estimated",
            "fin_note": "Order has not yet been delivered. Return eligibility cannot be confirmed until delivery.",
        }

    if status == "cancelled":
        return {
            "eligible": False, "reason": "Order was cancelled and cannot be returned.",
            "return_window_days": None, "return_window_expires_on": None,
            "days_remaining": None, "return_shipping_cost": None,
            "fin_note": "Order is cancelled. A refund was issued at cancellation.",
        }

    if order.get("damage_claim_active"):
        return {
            "eligible": True,
            "reason": "Item was reported damaged on arrival. Active damage claim under review.",
            "return_window_days": 30, "return_window_expires_on": None,
            "days_remaining": None, "return_shipping_cost": "free",
            "refund_locked": True, "refund_locked_reason": "damage_claim_under_review",
            "fin_note": "Active damage claim under review. Do not confirm refund until Returns Team completes review.",
        }

    # Delivered — check 30-day window from estimated_delivery
    est_delivery = order.get("estimated_delivery")
    if est_delivery:
        delivery_date = date.fromisoformat(est_delivery) if isinstance(est_delivery, str) else est_delivery
        window_days = 30
        expiry_date = delivery_date + timedelta(days=window_days)
        today = date.today()
        days_remaining = (expiry_date - today).days

        if days_remaining <= 0:
            return {
                "eligible": False,
                "reason": f"Return window expired on {expiry_date.isoformat()}. The 30-day window from estimated delivery has elapsed.",
                "return_window_days": window_days,
                "return_window_expires_on": expiry_date.isoformat(),
                "days_remaining": 0,
                "return_shipping_cost": "₹200–₹500 estimated",
                "fin_note": f"Return window expired on {expiry_date.isoformat()}. Any return requires agent exception approval.",
            }
        else:
            return {
                "eligible": True,
                "reason": f"Item is within the 30-day return window ({days_remaining} days remaining).",
                "return_window_days": window_days,
                "return_window_expires_on": expiry_date.isoformat(),
                "days_remaining": days_remaining,
                "return_shipping_cost": "free (defective/damaged); ₹200–₹500 customer pays (change of mind)",
                "fin_note": None,
            }

    return {
        "eligible": False,
        "reason": "Return eligibility could not be determined.",
        "return_window_days": None, "return_window_expires_on": None,
        "days_remaining": None, "return_shipping_cost": None,
        "fin_note": "Escalate to support team.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# AUTH MIDDLEWARE
# ─────────────────────────────────────────────────────────────────────────────
@app.before_request
def check_auth():
    if not request.path.startswith("/api"):
        return
    api_key  = request.headers.get("X-Api-Key", "")
    auth_hdr = request.headers.get("Authorization", "")
    bearer   = auth_hdr[len("Bearer "):] if auth_hdr.startswith("Bearer ") else ""
    if api_key == VALID_API_KEY or bearer == VALID_BEARER:
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
    return jsonify(_build_order_response(order))


@app.route("/api/customers/<customer_id>/orders", methods=["GET"])
def get_customer_orders(customer_id):
    if customer_id not in CUSTOMERS:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)
    orders = sorted(
        [o for o in ORDERS.values() if o["customer_id"] == customer_id],
        key=lambda o: o["placed_at"], reverse=True,
    )
    return jsonify({
        "ok": True,
        "customer_id": customer_id,
        "total_orders": len(orders),
        "orders": [_build_order_response(o) for o in orders],
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
    oe = ownership_error(customer_id, order["customer_id"])
    if oe:
        return oe
    ACCEPTED = ["changed_my_mind", "ordered_by_mistake", "found_better_price", "delivery_too_slow", "other"]
    if not reason:
        return err("missing_field", "Required field 'reason' is missing.", 400)
    if reason not in ACCEPTED:
        return err("invalid_reason", f"Invalid reason. Accepted: {', '.join(ACCEPTED)}.", 400)
    status = get_order_status(order)
    if status != "processing":
        return jsonify({
            "ok": False, "cancelled": False,
            "reason": "order_not_cancellable",
            "current_status": status,
            "fin_note": "Order cannot be cancelled — it is no longer in processing status.",
        }), 200
    order["cancelled"] = True
    STATUS_OVERRIDES[order_id] = "cancelled"

    # Restore stock only for orders that went through checkout (not seeded orders)
    if order.get("stock_decremented"):
        for item in order.get("items", []):
            p = PRODUCTS.get(item["product_id"])
            if p:
                p["stock"] += item["qty"]

    return jsonify({
        "ok": True, "cancelled": True, "order_id": order_id,
        "refund_method": "original_payment_method",
        "refund_timeline": "5–7 business days to your original payment method, plus 2–5 business days for your bank to process.",
    })


@app.route("/api/orders/<order_id>/address", methods=["POST"])
def update_address(order_id):
    order = ORDERS.get(order_id)
    if not order:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)
    body = request.get_json(silent=True) or {}
    customer_id = body.get("customer_id")
    new_address = body.get("new_address")
    if not customer_id:
        return err("missing_field", "Required field 'customer_id' is missing.", 400)
    oe = ownership_error(customer_id, order["customer_id"])
    if oe:
        return oe
    if not new_address or not all(k in new_address for k in ("street", "city", "state", "pincode")):
        return err("missing_field", "new_address must include: street, city, state, pincode.", 400)
    status = get_order_status(order)
    if status != "processing":
        return jsonify({
            "ok": False, "error": "address_update_not_allowed",
            "message": f"Address can only be updated when the order is in processing status (current: {status}).",
        }), 400
    order["delivery_address"] = new_address
    return jsonify({
        "ok": True, "order_id": order_id,
        "updated_address": new_address,
        "message": "Delivery address updated successfully.",
    })


@app.route("/api/orders/<order_id>/reschedule/slots", methods=["GET"])
def reschedule_slots(order_id):
    if order_id not in ORDERS:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)
    return jsonify({"ok": True, "slots": weekday_slots()})


@app.route("/api/orders/<order_id>/reschedule", methods=["POST"])
def reschedule_order(order_id):
    order = ORDERS.get(order_id)
    if not order:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)
    body = request.get_json(silent=True) or {}
    customer_id = body.get("customer_id")
    new_date = body.get("new_date")
    if not customer_id:
        return err("missing_field", "Required field 'customer_id' is missing.", 400)
    oe = ownership_error(customer_id, order["customer_id"])
    if oe:
        return oe
    status = get_order_status(order)
    if status not in ("processing", "dispatched"):
        return jsonify({
            "ok": False, "error": "reschedule_not_allowed",
            "message": f"Reschedule is only allowed for processing or dispatched orders (current: {status}).",
        }), 400
    slots = weekday_slots()
    if not new_date or new_date not in slots:
        return err("invalid_date", f"new_date must be one of the available slots: {', '.join(slots)}.", 400)
    order["estimated_delivery"] = new_date
    return jsonify({
        "ok": True, "order_id": order_id,
        "new_estimated_delivery": new_date,
        "message": f"Delivery rescheduled to {new_date}.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN B — RETURNS & REFUNDS
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/orders/<order_id>/return-eligibility", methods=["GET"])
def return_eligibility(order_id):
    if order_id not in ORDERS:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)
    elig = _return_eligibility_check(order_id)
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
    has_pkg = body.get("has_original_packaging")

    ACCEPTED_REASONS = ["change_of_mind", "item_not_as_described", "damaged_on_arrival", "defective", "wrong_item_received"]
    ACCEPTED_CONDITIONS = ["unused", "opened", "assembled"]

    missing = [f for f, v in [("customer_id", customer_id), ("reason", reason), ("condition", condition)] if not v]
    if has_pkg is None:
        missing.append("has_original_packaging")
    if missing:
        return err("missing_field", f"Required field(s) missing: {', '.join(missing)}.", 400)
    if reason not in ACCEPTED_REASONS:
        return err("invalid_reason", f"Invalid reason. Accepted: {', '.join(ACCEPTED_REASONS)}.", 400)
    if condition not in ACCEPTED_CONDITIONS:
        return err("invalid_condition", f"Invalid condition. Accepted: {', '.join(ACCEPTED_CONDITIONS)}.", 400)

    oe = ownership_error(customer_id, order["customer_id"])
    if oe:
        return oe

    elig = _return_eligibility_check(order_id)
    if not elig["eligible"]:
        return jsonify({"ok": False, "eligible": False, "reason": elig["reason"], "fin_note": elig.get("fin_note")}), 200

    return_id = f"RET-{_return_counter[0]}"
    _return_counter[0] += 1
    today = date.today()
    refund_eta = add_business_days(today, 7)
    free_return = reason in ("damaged_on_arrival", "defective", "wrong_item_received", "item_not_as_described")
    incl_shipping = free_return

    # Restore stock when return is initiated (only if this order decremented it)
    if order.get("stock_decremented"):
        for item in order.get("items", []):
            p = PRODUCTS.get(item["product_id"])
            if p:
                p["stock"] += item["qty"]

    item_names = ", ".join(i["product_name"] for i in order.get("items", []))
    DYNAMIC_RETURNS[return_id] = {
        "return_id": return_id, "order_id": order_id, "customer_id": customer_id,
        "item_name": item_names, "reason": reason, "condition": condition,
        "has_original_packaging": has_pkg, "status": "return_requested",
        "return_initiated": today.isoformat(), "return_received_date": None,
        "refund_status": "pending", "refund_amount": None,
        "refund_includes_shipping": incl_shipping,
        "refund_estimated_date": refund_eta.isoformat(),
        "refund_issued_date": None, "refund_method": "original_payment_method",
        "return_shipping": "free" if free_return else "₹200–₹500 (customer pays)",
        "fin_note": None,
    }
    return jsonify({
        "ok": True, "return_id": return_id, "status": "return_requested",
        "instructions": "Please repack the item securely and attach the return label to the outside. Drop off at any Delhivery or Blue Dart location within 14 days.",
        "return_shipping_label_url": f"https://returns.nestkart.com/label/{return_id}",
        "return_shipping_cost": "free" if free_return else "₹200–₹500 (customer pays)",
        "estimated_refund_date": refund_eta.isoformat(),
    })


@app.route("/api/returns/<return_id>", methods=["GET"])
def get_return(return_id):
    ret = RETURNS.get(return_id) or DYNAMIC_RETURNS.get(return_id)
    if not ret:
        return err("return_not_found", f"No return found with ID '{return_id}'.", 404)
    resp = {
        "ok": True,
        "return_id": ret["return_id"], "order_id": ret["order_id"],
        "item_name": ret["item_name"], "reason": ret["reason"],
        "status": ret["status"], "return_initiated": ret["return_initiated"],
        "return_received_date": ret.get("return_received_date"),
        "refund_status": ret["refund_status"], "refund_amount": ret.get("refund_amount"),
        "refund_includes_shipping": ret.get("refund_includes_shipping"),
        "refund_method": ret["refund_method"],
        "refund_estimated_date": ret.get("refund_estimated_date"),
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


@app.route("/api/orders/<order_id>/replacement", methods=["POST"])
def request_replacement(order_id):
    order = ORDERS.get(order_id)
    if not order:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)
    body = request.get_json(silent=True) or {}
    customer_id = body.get("customer_id")
    reason = body.get("reason")
    description = body.get("description")
    if not customer_id:
        return err("missing_field", "Required field 'customer_id' is missing.", 400)
    oe = ownership_error(customer_id, order["customer_id"])
    if oe:
        return oe
    if not order.get("damage_claim_active"):
        return jsonify({
            "ok": False, "error": "replacement_not_eligible",
            "message": "Replacement is only available for orders with an active damage claim.",
        }), 400
    replacement_id = f"REP-{_return_counter[0]}"
    _return_counter[0] += 1
    dispatch_date = add_business_days(date.today(), 5)
    return jsonify({
        "ok": True, "replacement_id": replacement_id,
        "status": "replacement_requested",
        "estimated_dispatch_date": dispatch_date.isoformat(),
        "fin_note": "Replacement request submitted. Returns Team will review the damage claim and confirm dispatch within 2 business days.",
    })


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
            "This customer is in AK/HI. Standard shipping surcharge applies. Express shipping not available."
        )
    if payment and payment["is_expired"]:
        fin_notes.append(
            f"Customer's saved payment method ({payment['type']} ••{payment['last_four']}) is expired. "
            "Flag this if they are placing or modifying an order."
        )
    resp = {
        "ok": True,
        "customer_id": cust["customer_id"],
        "name": cust["name"],
        "email": cust["email"],
        "phone": cust.get("phone"),
        "account_created": cust["account_created"],
        "marketing_opt_in": cust["marketing_opt_in"],
        "state": cust["state"],
        "address": cust.get("address"),
        "ak_hi_customer": ak_hi,
        "account_status": "active",
        "payment_method": {
            "type": payment["type"],
            "last_four": payment["last_four"],
            "expiry_month": payment["expiry_month"],
            "expiry_year": payment["expiry_year"],
            "is_expired": payment["is_expired"],
        } if payment else None,
    }
    if fin_notes:
        resp["fin_note"] = " ".join(fin_notes)
    return jsonify(resp)


@app.route("/api/customers/<customer_id>/addresses", methods=["GET"])
def get_addresses(customer_id):
    cust = CUSTOMERS.get(customer_id)
    if not cust:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)
    return jsonify({
        "ok": True,
        "customer_id": customer_id,
        "addresses": [{"address_id": "addr_default", "is_default": True, **cust["address"]}],
    })


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN D — PRODUCTS & REVIEWS
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/products", methods=["GET"])
def get_products():
    category = request.args.get("category")
    sort = request.args.get("sort")
    search = request.args.get("search", "").lower()

    products = list(PRODUCTS.values())

    if category and category != "all":
        products = [p for p in products if p["category"] == category]
    if search:
        products = [p for p in products if search in p["name"].lower()]

    if sort == "price_asc":
        products.sort(key=lambda p: p["price"])
    elif sort == "price_desc":
        products.sort(key=lambda p: p["price"], reverse=True)
    elif sort == "newest":
        # Use badge "New" first, then by product_id descending
        products.sort(key=lambda p: (0 if p.get("badge") == "New" else 1, p["product_id"]))

    result = []
    for p in products:
        item = dict(p)
        item["stock_status"] = derive_stock_status(p["stock"])
        result.append(item)

    return jsonify({"ok": True, "count": len(result), "products": result})


@app.route("/api/products/<product_id>", methods=["GET"])
def get_product(product_id):
    p = PRODUCTS.get(product_id)
    if not p:
        return err("product_not_found", f"No product found with ID '{product_id}'.", 404)
    item = dict(p)
    item["stock_status"] = derive_stock_status(p["stock"])
    return jsonify({"ok": True, **item})


@app.route("/api/products/<product_id>/reviews", methods=["GET"])
def get_reviews(product_id):
    if product_id not in PRODUCTS:
        return err("product_not_found", f"No product found with ID '{product_id}'.", 404)
    reviews = PRODUCT_REVIEWS.get(product_id, [])
    if not reviews:
        return jsonify({"ok": True, "product_id": product_id, "average_rating": None, "review_count": 0, "reviews": []})
    avg = round(sum(r["rating"] for r in reviews) / len(reviews), 1)
    recent = sorted(reviews, key=lambda r: r["date"], reverse=True)[:3]
    return jsonify({
        "ok": True, "product_id": product_id,
        "average_rating": avg, "review_count": len(reviews),
        "reviews": recent,
    })


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN E — CART & CHECKOUT
# ─────────────────────────────────────────────────────────────────────────────

def _build_cart_response(customer_id):
    items = CARTS.get(customer_id, [])
    subtotal = sum(i["line_total"] for i in items)
    has_large = any(PRODUCTS.get(i["product_id"], {}).get("shipping_type") == "large_item" for i in items)
    shipping_method = "large_item" if has_large else "standard"
    shipping_cost = 499 if has_large else 0
    return {
        "ok": True,
        "customer_id": customer_id,
        "items": items,
        "item_count": sum(i["qty"] for i in items),
        "subtotal": subtotal,
        "subtotal_formatted": format_inr(subtotal),
        "shipping_method": shipping_method,
        "shipping_cost": shipping_cost,
        "shipping_cost_formatted": format_inr(shipping_cost) if shipping_cost else "Free",
        "estimated_delivery_days": 10 if has_large else 5,
    }


@app.route("/api/cart/<customer_id>", methods=["GET"])
def get_cart(customer_id):
    if customer_id not in CUSTOMERS:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)
    return jsonify(_build_cart_response(customer_id))


@app.route("/api/cart/<customer_id>/add", methods=["POST"])
def add_to_cart(customer_id):
    if customer_id not in CUSTOMERS:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)
    body = request.get_json(silent=True) or {}
    product_id = body.get("product_id")
    qty = int(body.get("quantity", 1))
    if not product_id:
        return err("missing_field", "Required field 'product_id' is missing.", 400)
    p = PRODUCTS.get(product_id)
    if not p:
        return err("product_not_found", f"No product found with ID '{product_id}'.", 404)
    cart = CARTS.setdefault(customer_id, [])
    existing = next((i for i in cart if i["product_id"] == product_id), None)
    current_cart_qty = existing["qty"] if existing else 0
    requested_total = current_cart_qty + qty
    if p["stock"] == 0:
        return err("out_of_stock", f"'{p['name']}' is currently out of stock.", 400)
    if p["stock"] < requested_total:
        return err("insufficient_stock",
            f"Only {p['stock']} unit(s) of '{p['name']}' available "
            f"(you already have {current_cart_qty} in your cart).", 400)
    if existing:
        existing["qty"] += qty
        existing["line_total"] = existing["qty"] * existing["unit_price"]
    else:
        cart.append({
            "product_id": product_id,
            "product_name": p["name"],
            "unit_price": p["price"],
            "qty": qty,
            "line_total": p["price"] * qty,
            "image_url": p["image_url"],
            "category": p["category"],
        })
    return jsonify(_build_cart_response(customer_id))


@app.route("/api/cart/<customer_id>/update", methods=["POST"])
def update_cart(customer_id):
    if customer_id not in CUSTOMERS:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)
    body = request.get_json(silent=True) or {}
    product_id = body.get("product_id")
    qty = body.get("quantity")
    if not product_id or qty is None:
        return err("missing_field", "Required fields: product_id, quantity.", 400)
    qty = int(qty)
    cart = CARTS.setdefault(customer_id, [])
    if qty <= 0:
        CARTS[customer_id] = [i for i in cart if i["product_id"] != product_id]
    else:
        p = PRODUCTS.get(product_id)
        if p:
            if p["stock"] == 0:
                return err("out_of_stock", f"'{p['name']}' is currently out of stock.", 400)
            if p["stock"] < qty:
                return err("insufficient_stock",
                    f"Only {p['stock']} unit(s) of '{p['name']}' available.", 400)
        existing = next((i for i in cart if i["product_id"] == product_id), None)
        if existing:
            existing["qty"] = qty
            existing["line_total"] = qty * existing["unit_price"]
    return jsonify(_build_cart_response(customer_id))


@app.route("/api/cart/<customer_id>/remove", methods=["POST"])
def remove_from_cart(customer_id):
    if customer_id not in CUSTOMERS:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)
    body = request.get_json(silent=True) or {}
    product_id = body.get("product_id")
    if not product_id:
        return err("missing_field", "Required field 'product_id' is missing.", 400)
    CARTS[customer_id] = [i for i in CARTS.get(customer_id, []) if i["product_id"] != product_id]
    return jsonify(_build_cart_response(customer_id))


@app.route("/api/cart/<customer_id>/checkout", methods=["POST"])
def checkout(customer_id):
    if customer_id not in CUSTOMERS:
        return err("customer_not_found", f"No customer found with ID '{customer_id}'.", 404)
    cart_items = CARTS.get(customer_id, [])
    if not cart_items:
        return err("empty_cart", "Cannot checkout with an empty cart.", 400)

    # Validate stock for every item before touching anything
    for item in cart_items:
        p = PRODUCTS.get(item["product_id"])
        if p:
            if p["stock"] == 0:
                return err("out_of_stock",
                    f"'{p['name']}' is out of stock. Please remove it from your cart before checking out.", 400)
            if p["stock"] < item["qty"]:
                return err("insufficient_stock",
                    f"Only {p['stock']} unit(s) of '{p['name']}' available, but {item['qty']} requested.", 400)

    has_large = any(PRODUCTS.get(i["product_id"], {}).get("shipping_type") == "large_item" for i in cart_items)
    shipping_method = "large_item" if has_large else "standard"
    delivery_days = 10 if has_large else 5
    estimated_delivery = (datetime.now() + timedelta(days=delivery_days)).date().isoformat()
    price_total = sum(i["line_total"] for i in cart_items)

    order_id = f"ORD-{_order_counter[0]}"
    _order_counter[0] += 1

    ORDERS[order_id] = {
        "order_id": order_id,
        "customer_id": customer_id,
        "items": list(cart_items),
        "price_total": price_total,
        "placed_at": datetime.now(),
        "shipping_method": shipping_method,
        "estimated_delivery": estimated_delivery,
        "delivery_address": dict(CUSTOMERS[customer_id]["address"]),
        "damage_claim_active": False,
        "cancelled": False,
        "tracking_number": None,
        "fin_note": None,
        "stock_decremented": True,   # flag so cancel/return know to restore
    }

    # Decrement stock now that the order is confirmed
    for item in cart_items:
        p = PRODUCTS.get(item["product_id"])
        if p:
            p["stock"] = max(0, p["stock"] - item["qty"])

    CARTS[customer_id] = []

    return jsonify({
        "ok": True,
        "order_id": order_id,
        "price_total": price_total,
        "price_total_formatted": format_inr(price_total),
        "estimated_delivery": estimated_delivery,
        "shipping_method": shipping_method,
        "status": "processing",
    })


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN ROUTES — no auth required, demo only
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/admin/orders/<order_id>/set-status", methods=["POST"])
def admin_set_status(order_id):
    if order_id not in ORDERS:
        return err("order_not_found", f"No order found with ID '{order_id}'.", 404)
    body = request.get_json(silent=True) or {}
    status = body.get("status")
    VALID_STATUSES = ["processing", "dispatched", "in_transit", "delivered", "cancelled"]
    if not status or status not in VALID_STATUSES:
        return err("invalid_status", f"status must be one of: {', '.join(VALID_STATUSES)}.", 400)
    STATUS_OVERRIDES[order_id] = status
    if status == "cancelled":
        ORDERS[order_id]["cancelled"] = True
    else:
        ORDERS[order_id]["cancelled"] = False
    return jsonify({"ok": True, "order_id": order_id, "status": status})


@app.route("/admin/orders", methods=["GET"])
def admin_get_orders():
    customers_out = []
    for cust_id, cust in CUSTOMERS.items():
        orders = [o for o in ORDERS.values() if o["customer_id"] == cust_id]
        orders.sort(key=lambda o: o["placed_at"], reverse=True)
        customers_out.append({
            "customer_id": cust_id,
            "name": cust["name"],
            "orders": [_build_order_response(o) for o in orders],
        })
    return jsonify({"ok": True, "customers": customers_out})


@app.route("/admin/products/<product_id>/stock", methods=["POST"])
def admin_set_stock(product_id):
    p = PRODUCTS.get(product_id)
    if not p:
        return err("product_not_found", f"No product found with ID '{product_id}'.", 404)
    body = request.get_json(silent=True) or {}
    stock = body.get("stock")
    if stock is None or not isinstance(stock, int) or stock < 0:
        return err("invalid_stock", "Field 'stock' must be a non-negative integer.", 400)
    p["stock"] = stock
    return jsonify({
        "ok": True, "product_id": product_id, "name": p["name"],
        "stock": stock, "stock_status": derive_stock_status(stock),
    })


@app.route("/admin/reset", methods=["POST"])
def admin_reset():
    global ORDERS, STATUS_OVERRIDES, DYNAMIC_RETURNS, CARTS
    # Remove runtime orders (not in seed set)
    for oid in list(ORDERS.keys()):
        if oid not in _SEED_ORDER_IDS:
            del ORDERS[oid]
    STATUS_OVERRIDES.clear()
    DYNAMIC_RETURNS.clear()
    CARTS.clear()
    _order_counter[0] = 10200
    _return_counter[0] = 2210
    # Restore all product stocks to original seeded values
    for pid, original_stock in _ORIGINAL_STOCK.items():
        if pid in PRODUCTS:
            PRODUCTS[pid]["stock"] = original_stock
    _seed_orders()
    return jsonify({"ok": True, "message": "Demo reset complete. All seed orders refreshed."})


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"NestKart Mock API v4.0.0 — http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
