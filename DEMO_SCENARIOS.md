# NestKart E-Commerce Agent — Demo Scenario Matrix

Source of truth for the agent's own capability contract is `lib/openapi.ts`
(served at `GET /api/openapi`). This file is the demo script layered on top
of it: which customer/order/return/replacement to use for each capability,
and the exact eligibility outcome to expect. All data is seeded fresh by
`lib/data.ts` and restored by **Reset Demo** in `/admin`.

## The 10 Official Agent Capabilities

Unchanged. This demo does not add an 11th.

**Read:** Order Lookup · Order History · Return Status Lookup · Customer
Profile Lookup.
**Write:** Cancel Order · Update Delivery Address · Reschedule Delivery ·
Initiate Return · Request Replacement · Customer Profile Update.

Replacement *records* are now persisted (`ReplacementRecord` in
`lib/data.ts`) with admin visibility and two read endpoints
(`GET /api/replacements/{id}`, `GET /api/customers/{id}/replacements`) — this
is demo/admin infrastructure so a filed replacement can be inspected, the
same way a return can. It is **not** a distinct Agent capability; "Request
Replacement" is still the only capability that touches replacements.

## Customer Profile Update — supported fields

Inspected directly in `pages/api/customers/[customer_id]/update.ts`. Only
**`name`**, **`email`**, **`phone`** can be changed, partially (only the
fields present in the request body are touched). The profile **address is
deliberately not editable** through this endpoint — it exists to avoid two
endpoints (`/customers/{id}/update` and `/orders/{id}/address`) both being
able to write "the address" and colliding on which one they mean. Only an
order's `delivery_address` is editable, via Update Delivery Address.

## Request Replacement — eligibility rule (corrected this pass)

Previously `replaceable` was defined identically to `returnable` — any
delivered order within the 30-day window, damaged or not. That has been
narrowed to a dedicated `replacementEligibilityCheck()` in `lib/helpers.ts`,
used by both `orderActions()` (the `replaceable` flag on every order
response) and the `POST /api/orders/{id}/replacement` endpoint itself:

**Allowed** when the order is `delivered`, has an **active damage claim**
(`damage_claim_active: true`), is within the 30-day return window measured
from `estimated_delivery`, and no replacement has already been requested.

**Rejected** when: still `processing`/`dispatched`/`in_transit` (not
delivered), the order is `cancelled`, there is **no active damage claim**,
the 30-day window has **expired** (even with an active damage claim), or a
replacement was **already requested** for that order.

## Customers

| ID | Name | Story |
|---|---|---|
| `cust_001` Priya Sharma | Active shopper | 4 orders spanning processing/delivered/cancelled, 3 returns in different stages |
| `cust_002` Arjun Mehta | Returns & delivery changes | 4 orders (processing/dispatched/delivered ×2), a completed refund and an in-transit return |
| `cust_003` Kavitha Nair | Damaged items | 2 delivered orders with active damage claims — one already replaced, one open for the live "request a replacement" demo |
| `cust_004` Rohit Verma | Edge cases | Processing orders (cancellable, one with live inventory restoration), a delivered order past the 30-day window, a delivered order with a damage claim past the window, and a delivered order with a completed historical replacement |
| `cust_005` Anika Rossi | Empty history | Zero orders, expired payment method — "I can't find your order" |

## Orders

| Order | Customer | Status | Purpose |
|---|---|---|---|
| ORD-10101 | cust_001 | delivered | No return filed — returnable |
| ORD-10102 | cust_001 | delivered | No return filed — returnable |
| ORD-10103 | cust_001 | delivered | Has RET-2202 (just requested) |
| ORD-10104 | cust_001 | processing | **Cancellable + live inventory restoration** (prod_012 19→20, prod_015 7→8 on cancel) |
| ORD-10201 | cust_002 | delivered | Has RET-2204 (return in transit) |
| ORD-10202 | cust_002 | delivered | No return filed — returnable |
| ORD-10203 | cust_002 | dispatched | **Not** cancellable/address-updatable; still reschedulable |
| ORD-10204 | cust_002 | processing | Cancellable, address-updatable, reschedulable |
| ORD-10301 | cust_003 | delivered | Damage claim active, **no replacement filed yet**, within window — `replaceable: true`, live demo order |
| ORD-10302 | cust_003 | delivered | Damage claim active, REP-3001 already dispatched — `replaceable: false` (already requested) |
| ORD-10303 | cust_003 | dispatched | Plain delivery-info lookup |
| ORD-10401 | cust_004 | delivered | Window expired, no damage claim — `replaceable: false` / return also rejected |
| ORD-10402 | cust_004 | delivered | Damage claim active **but window expired** — `replaceable: false` (window trumps the claim) |
| ORD-10403 | cust_004 | delivered | Damage claim + REP-3002 **completed** — historical/closed replacement demo |
| ORD-10404 | cust_004 | delivered | Clean, no damage claim, within window — `replaceable: false` (no damage claim) |
| ORD-10405 | cust_004 | processing | Cancellable, address-updatable |

## Returns & Replacements

| ID | Order | Status | Refund/Replacement status |
|---|---|---|---|
| RET-2202 | ORD-10103 | return_requested | refund pending |
| RET-2204 | ORD-10201 | return_in_transit | refund pending |
| REP-3001 | ORD-10302 | replacement_dispatched | tracking active |
| REP-3002 | ORD-10403 | completed | delivered |

## Inventory Demo (Cancel Order)

`ORD-10104` (cust_001, processing) is seeded with `stock_decremented: true`
against `prod_012` (Terracotta Planter Trio) and `prod_015` (Mango Wood Side
Table) — both seeded one unit lower than their catalog baseline (19 and 7)
to represent the units this order already reserved.

| | prod_012 stock | prod_015 stock | Order status |
|---|---|---|---|
| Before | 19 | 7 | processing |
| Agent: "I want to cancel my order." | — | — | — |
| After | **20** | **8** | **cancelled** |

Verified live against the dev server — see section below.

## Capability Coverage — Verification Table

Every row below was executed against the running dev server this session
(not assumed from reading code), then the environment was reset.

| Capability | Positive scenario | Negative scenario | Verified |
|---|---|---|---|
| Order Lookup | `GET /api/orders/ORD-10104` → processing | `GET /api/orders/ORD-99999` → order_not_found | Yes |
| Order History | `GET /api/customers/cust_001/orders` → 4 orders | `GET /api/customers/cust_005/orders` → 0 orders | Yes |
| Return Status Lookup | `GET /api/returns/RET-2202` → return_requested | `GET /api/returns/RET-9999` → return_not_found | Yes |
| Customer Profile Lookup | `GET /api/customers/cust_001` → Priya Sharma | `GET /api/customers/cust_999` → customer_not_found | Yes |
| Cancel Order | ORD-10104 (processing) → cancelled, stock 19→20 & 7→8 | ORD-10102 (delivered) → order_not_cancellable | Yes |
| Update Delivery Address | ORD-10405 (processing) → address updated | ORD-10404 (delivered) → address_update_not_allowed | Yes |
| Reschedule Delivery | ORD-10204 → real slot list, rescheduled to it | ORD-10202 (delivered) → reschedule_not_allowed | Yes |
| Initiate Return | ORD-10404 (delivered) → RET created | ORD-10405 (processing) → return_not_eligible | Yes |
| Request Replacement | ORD-10301 (damaged, within window) → replacement created | ORD-10404 (no damage claim) → replacement_not_eligible | Yes |
| Customer Profile Update | cust_001 phone → updated, confirmed via lookup | cust_002 invalid email → invalid_field | Yes |

Additional Request Replacement negatives verified beyond the table above:
ORD-10402 (damage claim but window expired) → `replacement_not_eligible`;
ORD-10302 (already requested) → `replacement_already_requested`.

## Reset Demo — Verified Comprehensive

Performed a full write pass (profile update, cancel, reschedule, address
change, return, replacement) then called `POST /api/admin/reset` and
re-checked every mutated resource:

| Resource | Dirtied value | After reset |
|---|---|---|
| cust_001 phone | 919999999999 | 919810012345 (seed) |
| ORD-10204 estimated_delivery | rescheduled date | back to seed date |
| ORD-10405 delivery_address.street | "New Address" | seed address restored |
| prod_012 stock | 19 (after live decrement/restore cycle) | 19 (seed baseline) |
| cust_004 replacements | REP-3010 (agent-filed) | gone — only seeded REP-3002 remains |
| cust_004 returns | 1 (agent-filed) | 0 (seed has none) |

Reset restores customers, orders, inventory, returns/refunds, damage claims
and replacement records. The request log is deliberately excluded from
reset (cleared separately via `DELETE /api/admin/log`) so a demo's trail
survives a data reset.

## Conversation Test Utterances

Simple:
- "Where's my order?"
- "I want to cancel my order."
- "Can you change the delivery address?"
- "Where is my refund?"
- "Can you deliver it later instead?"
- "What have I bought recently?"
- "Update my phone number please."
- "This arrived damaged, can I get a replacement?"

Ambiguous (agent must resolve which order/customer):
- "I want to cancel it."
- "Can you change the address on my order?"
- "My order hasn't arrived yet."
- "Any update on my return?"

Negative / edge (agent must refuse per real business rules, not guess):
- "Can you cancel my order?" (on a delivered order)
- "Can you change my delivery address?" (on a dispatched order)
- "Can I return this?" (on an order outside the 30-day window)
- "Can you replace this?" (on a delivered order with no damage claim)
- "Can I get another replacement?" (on an order that already has one)
- "Where's my order?" (as cust_005, who has none)

## Recommended 7–10 Minute Demo Flow

1. **Order lookup** — cust_001, "Where's my order?" → ORD-10104, processing.
   *Admin:* Orders tab shows the same status.
2. **Order history** — cust_001, "What have I ordered recently?" → 4 orders
   across processing/delivered/cancelled.
3. **Cancel order + visible inventory** — cust_001, "I want to cancel my
   order" (ORD-10104). *Admin:* Orders tab → ORD-10104 flips to cancelled;
   Inventory tab → Terracotta Planter Trio 19→20, Mango Wood Side Table 7→8.
4. **Update delivery address** — cust_004, "Can you change the delivery
   address on my order?" (ORD-10405, processing). *Admin:* Orders tab shows
   the new address on that row.
5. **Reschedule delivery** — cust_002, "Can you deliver it a bit later?"
   (ORD-10204). Agent should offer only real weekday slots. *Admin:* Delivery
   date column updates.
6. **Return / refund lookup** — cust_001, "Where's my refund?" → RET-2202,
   return_requested / refund pending.
7. **Initiate return** — cust_004, "I want to return this" (ORD-10404,
   delivered, no damage). *Admin:* Returns tab shows the new return_requested
   row.
8. **Damaged-item replacement** — cust_003, "This arrived damaged, can I get
   a replacement?" (ORD-10301). *Admin:* Replacements tab shows the new
   replacement_requested row.
9. **Customer profile update** — cust_001, "Update my phone number to
   ...". *Admin:* no direct customer view, but a follow-up profile lookup
   confirms the new number.
10. **Negative business rules** — cust_001, "Can you cancel my delivered
    order?" (ORD-10102, denied) and cust_004, "Can you replace this?"
    (ORD-10404, denied — no damage claim). Shows the agent refusing correctly
    instead of guessing.

**End every demo by clicking Reset Demo** in `/admin` (or `POST
/api/admin/reset`) to restore the clean seeded state before the next run.

## Known Gaps / Notes

- Damage claims are not a first-class agent action — an order's damage claim
  can only be set as a side effect of filing a return with reason "damaged
  on arrival", or (as done here) directly in seed data. There is no `POST
  /api/orders/{id}/damage-claim`.
- Seed orders other than ORD-10104 do not set `stock_decremented`, so
  cancelling them will not move inventory. Only ORD-10104 is wired for the
  visible inventory demo; a live cart checkout would also decrement stock on
  any product before a subsequent cancel.
