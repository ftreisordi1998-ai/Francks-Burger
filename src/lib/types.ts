export type EditionStatus = "draft" | "open" | "closed";
export type WindowType = "delivery" | "pickup";
export type FulfillmentType = "delivery" | "pickup";
export type PaymentStatus = "pending" | "paid" | "refund_pending" | "refunded";
export type PaymentMethod = "pix" | "card" | "cash";
export type OrderStatus =
  | "awaiting_confirmation"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export interface Edition {
  id: string;
  title: string;
  prep_date: string;
  order_deadline: string;
  opens_at: string | null;
  status: EditionStatus;
  reservation_expiry_minutes: number;
  payment_deadline_hours: number | null;
  pix_key: string | null;
  pix_recipient_name: string | null;
  pix_city: string | null;
  accepts_card_on_delivery: boolean;
  accepts_cash_on_delivery: boolean;
  pickup_enabled: boolean;
  pickup_address: string | null;
  free_delivery: boolean;
  notes_public: string | null;
  is_demo: boolean;
  projected_revenue_cents: number | null;
  created_at: string;
  updated_at: string;
}

export type FinanceExpenseStatus = "previsto" | "pago";
export type FinancePaymentMethod = "pix" | "dinheiro" | "cartao";

export interface FinanceExpense {
  id: string;
  edition_id: string;
  description: string;
  amount_cents: number;
  status: FinanceExpenseStatus;
  created_at: string;
  updated_at: string;
}

export interface FinanceIncome {
  id: string;
  edition_id: string;
  description: string;
  amount_cents: number;
  payment_method: FinancePaymentMethod;
  created_at: string;
}

export interface PreviousOrderRow {
  id: string;
  created_at: string;
  order_status: OrderStatus;
  edition_title: string;
}

export interface OrderIncomeRow {
  id: string;
  customer_name: string;
  total_cents: number;
  payment_method: PaymentMethod;
  created_at: string;
}

export interface Product {
  id: string;
  edition_id: string;
  name: string;
  description: string;
  price_cents: number;
  image_url: string | null;
  stock_qty: number;
  available_qty: number;
  sort_order: number;
  active: boolean;
}

export interface DeliveryWindow {
  id: string;
  edition_id: string;
  type: WindowType;
  label: string;
  starts_at: string;
  ends_at: string;
  capacity_burgers: number;
  reserved_burgers: number;
  active: boolean;
}

export interface Neighborhood {
  id: string;
  edition_id: string;
  name: string;
  delivery_fee_cents: number;
  active: boolean;
}

export interface OrderItemView {
  product_name: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
  doneness: string | null;
  customer_note: string | null;
}

export interface OrderTrackingView {
  id: string;
  public_token: string;
  customer_name: string;
  fulfillment_type: FulfillmentType;
  window_label: string;
  neighborhood_name: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  created_at: string;
  expires_at: string | null;
  items: OrderItemView[];
  edition_title: string;
  edition_prep_date: string;
  pix_key: string | null;
  pix_recipient_name: string | null;
  pix_city: string | null;
  payment_deadline_hours: number | null;
  payment_method: PaymentMethod;
  cash_change_for_cents: number | null;
}

export interface AdminOrderRow {
  id: string;
  edition_id: string;
  customer_name: string;
  whatsapp: string;
  fulfillment_type: FulfillmentType;
  window_label_snapshot: string;
  neighborhood_name_snapshot: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_reference: string | null;
  notes: string | null;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  cash_change_for_cents: number | null;
  order_status: OrderStatus;
  created_at: string;
  expires_at: string | null;
  cancel_reason: string | null;
  confirmation_notified_at: string | null;
  editions: { title: string; prep_date: string } | null;
}

export interface EditionOption {
  id: string;
  title: string;
  prep_date: string;
}

export interface CartItem {
  lineId: string;
  productId: string;
  name: string;
  priceCents: number;
  qty: number;
  doneness?: string;
  note?: string;
}
