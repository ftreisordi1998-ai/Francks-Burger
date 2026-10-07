import { createClient } from "@/lib/supabase/server";
import { FinanceiroScreen } from "@/components/admin/FinanceiroScreen";
import type { EditionOption, FinanceExpense, FinanceIncome, OrderIncomeRow } from "@/lib/types";

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
      />
    );
  }

  const [
    { data: edition },
    { data: products },
    { data: incomes },
    { data: expenses },
    { data: paidOrders },
    { data: openOrders },
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
      .select("total_cents")
      .eq("edition_id", editionId)
      .eq("payment_status", "pending")
      .neq("order_status", "cancelled"),
  ]);

  const suggestedProjectedCents = (products ?? []).reduce(
    (sum, p) => sum + p.stock_qty * p.price_cents,
    0
  );
  const openAmountCents = (openOrders ?? []).reduce((sum, o) => sum + o.total_cents, 0);

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
    />
  );
}
