import { createClient } from "@/lib/supabase/server";
import { FinanceiroScreen } from "@/components/admin/FinanceiroScreen";
import type {
  DeliveryWindow,
  EditionOption,
  FinanceExpense,
  FinanceIncome,
  OrderIncomeRow,
  PendingOrderRow,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminFinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ edition?: string }>;
}) {
  const { edition: editionIdParam } = await searchParams;
  const supabase = await createClient();

  const { data: editions } = await supabase
    .from("editions")
    .select("id, title, prep_date")
    .order("prep_date", { ascending: false });

  const editionId =
    editionIdParam ?? (editions && editions.length > 0 ? editions[0].id : undefined);

  if (!editionId) {
    return (
      <FinanceiroScreen
        editions={(editions ?? []) as EditionOption[]}
        selectedEditionId=""
        projectedRevenueCents={null}
        suggestedProjectedCents={0}
        incomes={[]}
        expenses={[]}
        orderIncomes={[]}
        openAmountCents={0}
        windows={[]}
        pendingOrders={[]}
        confirmedPaymentByOrderId={{}}
      />
    );
  }

  const [
    { data: edition },
    { data: products },
    { data: incomes },
    { data: expenses },
    { data: paidOrders },
    { data: pendingOrdersData },
    { data: windows },
  ] = await Promise.all([
    supabase
      .from("editions")
      .select("projected_revenue_cents")
      .eq("id", editionId)
      .maybeSingle(),
    supabase
      .from("products")
      .select("stock_qty, price_cents")
      .eq("edition_id", editionId),
    supabase
      .from("finance_incomes")
      .select("*")
      .eq("edition_id", editionId)
      .order("created_at", { ascending: false }),
    supabase
      .from("finance_expenses")
      .select("*")
      .eq("edition_id", editionId)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id, customer_name, total_cents, payment_method, created_at")
      .eq("edition_id", editionId)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id, customer_name, total_cents, payment_method, window_id, window_label_snapshot, created_at")
      .eq("edition_id", editionId)
      .eq("payment_status", "pending")
      .neq("order_status", "cancelled"),
    supabase
      .from("delivery_windows")
      .select("id, edition_id, type, label, starts_at, ends_at, capacity_burgers, reserved_burgers, active")
      .eq("edition_id", editionId)
      .order("starts_at", { ascending: true }),
  ]);

  const pendingOrders = (pendingOrdersData ?? []) as PendingOrderRow[];
  const pendingOrderIds = pendingOrders.map((o) => o.id);

  const { data: confirmedPayments } =
    pendingOrderIds.length > 0
      ? await supabase
          .from("delivery_session_stops")
          .select("order_id, payment_method_confirmed")
          .in("order_id", pendingOrderIds)
          .not("payment_method_confirmed", "is", null)
      : { data: [] };

  const confirmedPaymentByOrderId: Record<string, string> = {};
  for (const row of confirmedPayments ?? []) {
    if (row.order_id && row.payment_method_confirmed) confirmedPaymentByOrderId[row.order_id] = row.payment_method_confirmed;
  }

  const suggestedProjectedCents = (products ?? []).reduce(
    (sum, p) => sum + p.stock_qty * p.price_cents,
    0
  );
  const openAmountCents = pendingOrders.reduce((sum, o) => sum + o.total_cents, 0);

  return (
    <FinanceiroScreen
      editions={(editions ?? []) as EditionOption[]}
      selectedEditionId={editionId}
      projectedRevenueCents={edition?.projected_revenue_cents ?? null}
      suggestedProjectedCents={suggestedProjectedCents}
      incomes={(incomes ?? []) as FinanceIncome[]}
      expenses={(expenses ?? []) as FinanceExpense[]}
      orderIncomes={(paidOrders ?? []) as OrderIncomeRow[]}
      openAmountCents={openAmountCents}
      windows={(windows ?? []) as DeliveryWindow[]}
      pendingOrders={pendingOrders}
      confirmedPaymentByOrderId={confirmedPaymentByOrderId}
    />
  );
}
