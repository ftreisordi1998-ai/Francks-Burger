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
  edition_id: string;
  window_id: string;
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

export type GeocodeStatus = "ok" | "ambiguous" | "failed" | "manual";

export interface RouteOrderRow {
  id: string;
  customer_name: string;
  whatsapp: string;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_reference: string | null;
  neighborhood_name_snapshot: string | null;
  address_lat: number | null;
  address_lng: number | null;
  address_geocode_status: GeocodeStatus | null;
  order_items: { product_name_snapshot: string; qty: number }[];
}

export interface KitchenLocation {
  id: "default";
  address_street: string | null;
  address_number: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  confirmed_at: string | null;
}

export interface GeocodeCandidate {
  lat: number;
  lng: number;
  placeName: string;
  relevance: number;
}

export interface RouteStop {
  stopIndex: number;
  lat: number;
  lng: number;
  addressLabel: string;
  orders: { id: string; customerName: string; items: string; address: string }[];
  etaIso: string | null;
}

export interface RoutePlanResult {
  stops: RouteStop[];
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
  returnGeometry: { type: "LineString"; coordinates: [number, number][] } | null;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  failedOrders: { id: string; customerName: string; reason: GeocodeStatus }[];
  departureIso: string | null;
}

export type DeliverySessionStatus = "pending" | "active" | "ended";

export interface DeliverySession {
  id: string;
  edition_id: string;
  window_id: string;
  token: string;
  status: DeliverySessionStatus;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string;
  created_at: string;
  active_device_id: string | null;
}

export interface ActiveDeliveryPosition {
  active: boolean;
  lat?: number;
  lng?: number;
  heading?: number | null;
  updated_at?: string;
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
