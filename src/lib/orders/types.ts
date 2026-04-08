// ═══════════════════════════════════════════════════════════════════
// FILE 1: lib/orders/types.ts
// Changes: add 'source' field and 'is_pos' to AdminOrder
// ═══════════════════════════════════════════════════════════════════

export type OrderSource = 'web' | 'pos';
export type OrderStatus = 'pending' | 'processing' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded';
export type FulfillmentStatus = 'unfulfilled' | 'partial' | 'fulfilled' | 'returned' | 'cancelled';

export interface ShippingAddress {
  firstName?: string;
  lastName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
}

export interface AdminOrderItem {
  id: string;
  sku: string;
  title: string;
  variant_title?: string;
  quantity: number;
  price_cents: number;
  weight_grams?: number | null;
}

export interface AdminOrder {
  id: string;
  order_number: string;
  created_at: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  subtotal_cents?: number;
  shipping_cents?: number;
  tax_cents?: number;
  discount_cents?: number;
  total_cents: number;
  email: string;
  customer_first_name?: string;
  customer_last_name?: string;
  shipping_address: ShippingAddress | null;
  shipping_method_name?: string;
  items: AdminOrderItem[];
  tracking_number?: string;
  tracking_url?: string;
  label_pdf_path?: string;
  label_postage_cents?: number;
  internal_notes?: string;
  // Identity — mutually exclusive
  source: OrderSource;    // 'web' | 'pos'
  is_pos: boolean;        // source === 'pos' — in-person admin sale, no shipping needed
  is_member: boolean;     // auth_user_id is set — logged-in web purchase
  is_guest: boolean;      // guest_key set, no auth — anonymous web purchase
  is_legacy: boolean;     // pre-identity system, both null
  points_earned: number;
}