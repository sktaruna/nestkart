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
  description?: string;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface CartItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  qty: number;
  line_total: number;
  image_url: string;
  category?: string;
}

export interface CartResponse {
  ok: boolean;
  customer_id: string;
  items: CartItem[];
  item_count: number;
  subtotal: number;
  subtotal_formatted?: string;
  shipping_method?: string;
  shipping_cost: number;
  shipping_cost_formatted?: string;
  estimated_delivery_days?: number;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface Order {
  ok?: boolean;
  order_id: string;
  customer_id: string;
  items: OrderItem[];
  price_total: number;
  price_total_formatted?: string;
  placed_at: string;
  status: 'processing' | 'dispatched' | 'in_transit' | 'delivered' | 'cancelled';
  shipping_method: string;
  estimated_delivery: string | null;
  delivery_address?: Record<string, string>;
  damage_claim_active: boolean;
  tracking_number: string | null;
  tracking_url: string | null;
  is_seed: boolean;
}

export interface Customer {
  ok: boolean;
  customer_id: string;
  name: string;
  email: string;
  phone: string | null;
  account_created: string;
  marketing_opt_in: boolean;
  state: string;
  address?: { street: string; city: string; state: string; pincode: string };
  orders: string[];
  account_status: string;
}

/** One API call as recorded by GET /api/admin/log. */
export interface RequestLogEntry {
  ts: string;
  method: string;
  path: string;
  status: number;
  /** From the response body, not the HTTP status. Null if the response wasn't JSON. */
  ok: boolean | null;
  error?: string;
  reason?: string;
  body?: unknown;
  ms: number;
}

/** Shape of GET /api/admin/returns — every flag present, never omitted. */
export interface AdminReturn {
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
  refund_estimated_date: string | null;
  refund_issued_date: string | null;
  refund_locked: boolean;
  refund_locked_reason: string | null;
  requires_agent_escalation: boolean;
  escalation_reason: string | null;
  is_seed: boolean;
}

export interface AdminCustomerOrders {
  customer_id: string;
  name: string;
  orders: Order[];
}
