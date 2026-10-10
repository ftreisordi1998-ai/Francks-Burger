"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "@/lib/dialog-context";
import { createClient } from "@/lib/supabase/client";
import { formatCents, formatDateTime } from "@/lib/format";
import { FINANCE_EXPENSE_STATUS_LABEL, FINANCE_PAYMENT_METHOD_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/status";
import type {
  DeliveryWindow,
  EditionOption,
  FinanceExpense,
  FinanceExpenseStatus,
  FinanceIncome,
  FinancePaymentMethod,
  OrderIncomeRow,
  PaymentMethod,
  PendingOrderRow,
} from "@/lib/types";

const EXPENSE_SUGGESTION_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "Insumos do lanche",
    items: ["Carne", "Pão", "Cheddar", "Bacon"],
  },
  {
    label: "Salada",
    items: ["Alface", "Tomate", "Cebola roxa", "Rúcula"],
  },
  {
    label: "Cebola caramelizada",
    items: ["Cebola caramelizada"],
  },
  {
    label: "Maionese caseira (uma ou outra, não as duas)",
    items: ["Maionese caseira (pronta)", "Ingredientes da maionese caseira"],
  },
  {
    label: "Temperos",
    items: ["Manteiga", "Sal e temperos"],
  },
  {
    label: "Embalagem",
    items: ["Embalagens", "Sacolas", "Guardanapos"],
  },
  {
    label: "Operacional",
    items: ["Carvão", "Gás", "Água", "Energia", "Limpeza"],
  },
  {
    label: "Mão de obra e taxas",
    items: ["Motoboy", "Mão de obra", "Taxas do cartão", "Impostos", "Outros gastos"],
  },
];

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function inputToCents(value: string): number {
  return Math.round(Number(value.replace(",", ".")) * 100) || 0;
}

const PAYMENT_TO_FINANCE: Record<PaymentMethod, FinancePaymentMethod> = {
  pix: "pix",
  cash: "dinheiro",
  card: "cartao",
};

const FINANCE_TO_PAYMENT: Record<FinancePaymentMethod, PaymentMethod> = {
  pix: "pix",
  dinheiro: "cash",
  cartao: "card",
};

export function FinanceiroScreen({
  editions,
  selectedEditionId,
  projectedRevenueCents,
  suggestedProjectedCents,
  incomes: initialIncomes,
  expenses: initialExpenses,
  orderIncomes,
  openAmountCents,
  windows,
  pendingOrders,
  confirmedPaymentByOrderId,
}: {
  editions: EditionOption[];
  selectedEditionId: string;
  projectedRevenueCents: number | null;
  suggestedProjectedCents: number;
  incomes: FinanceIncome[];
  expenses: FinanceExpense[];
  orderIncomes: OrderIncomeRow[];
  openAmountCents: number;
  windows: DeliveryWindow[];
  pendingOrders: PendingOrderRow[];
  confirmedPaymentByOrderId: Record<string, string>;
}) {
  const router = useRouter();
  const { confirmDialog, alertDialog } = useDialog();

  const [projected, setProjected] = useState(projectedRevenueCents ?? suggestedProjectedCents);
  const [projectedInput, setProjectedInput] = useState(centsToInput(projected));
  const [savingProjected, setSavingProjected] = useState(false);

  const [incomes, setIncomes] = useState(initialIncomes);
  const [incomeDesc, setIncomeDesc] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeMethod, setIncomeMethod] = useState<FinancePaymentMethod>("pix");
  const [savingIncome, setSavingIncome] = useState(false);
  const [openWindowId, setOpenWindowId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const registeredOrderIds = useMemo(
    () => new Set(incomes.map((i) => i.order_id).filter((id): id is string => Boolean(id))),
    [incomes]
  );

  const pendingByWindow = useMemo(() => {
    const map = new Map<string, PendingOrderRow[]>();
    for (const order of pendingOrders) {
      if (registeredOrderIds.has(order.id)) continue;
      const key = order.window_id ?? "sem-janela";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    }
    return map;
  }, [pendingOrders, registeredOrderIds]);

  function selectOrderForConfirm(order: PendingOrderRow) {
    if (selectedOrderId === order.id) {
      setSelectedOrderId(null);
      setIncomeDesc("");
      setIncomeAmount("");
      return;
    }
    setSelectedOrderId(order.id);
    setIncomeDesc(order.customer_name);
    setIncomeAmount(centsToInput(order.total_cents));
    const confirmed = confirmedPaymentByOrderId[order.id] as PaymentMethod | undefined;
    setIncomeMethod(PAYMENT_TO_FINANCE[confirmed ?? order.payment_method]);
  }

  const [expenses, setExpenses] = useState(initialExpenses);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseStatus, setExpenseStatus] = useState<FinanceExpenseStatus>("previsto");
  const [savingExpense, setSavingExpense] = useState(false);

  async function saveProjected() {
    const cents = inputToCents(projectedInput);
    setSavingProjected(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("editions")
      .update({ projected_revenue_cents: cents })
      .eq("id", selectedEditionId);
    setSavingProjected(false);
    if (!error) {
      setProjected(cents);
      setProjectedInput(centsToInput(cents));
    }
  }

  function useSuggestion() {
    setProjectedInput(centsToInput(suggestedProjectedCents));
  }

  async function addIncome() {
    const amount_cents = inputToCents(incomeAmount);
    if (!incomeDesc.trim() || amount_cents <= 0) return;
    setSavingIncome(true);

    if (selectedOrderId) {
      const supabase = createClient();
      const { error } = await supabase.rpc("confirm_order_payment", {
        p_order_id: selectedOrderId,
        p_method: FINANCE_TO_PAYMENT[incomeMethod],
        p_confirmed_by: "admin",
      });
      setSavingIncome(false);
      if (error) {
        await alertDialog({
          title: "Não foi possível confirmar",
          message: "Tente novamente em instantes.",
          tone: "danger",
        });
        return;
      }
      setSelectedOrderId(null);
      setIncomeDesc("");
      setIncomeAmount("");
      router.refresh();
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("finance_incomes")
      .insert({
        edition_id: selectedEditionId,
        description: incomeDesc.trim(),
        amount_cents,
        payment_method: incomeMethod,
      })
      .select("*")
      .single();
    setSavingIncome(false);
    if (!error && data) {
      setIncomes((prev) => [data as FinanceIncome, ...prev]);
      setIncomeDesc("");
      setIncomeAmount("");
    }
  }

  async function moveIncomeToExpense(income: FinanceIncome) {
    const supabase = createClient();
    const { data: newExpense, error: insertError } = await supabase
      .from("finance_expenses")
      .insert({
        edition_id: income.edition_id,
        description: income.description,
        amount_cents: income.amount_cents,
        status: "pago",
      })
      .select("*")
      .single();
    if (insertError || !newExpense) {
      await alertDialog({ title: "Não foi possível mover", message: "Tente novamente em instantes.", tone: "danger" });
      return;
    }
    const { error: deleteError } = await supabase.from("finance_incomes").delete().eq("id", income.id);
    if (deleteError) {
      await supabase.from("finance_expenses").delete().eq("id", newExpense.id);
      await alertDialog({ title: "Não foi possível mover", message: "Tente novamente em instantes.", tone: "danger" });
      return;
    }
    setIncomes((prev) => prev.filter((i) => i.id !== income.id));
    setExpenses((prev) => [newExpense as FinanceExpense, ...prev]);
  }

  async function deleteIncome(income: FinanceIncome) {
    const ok = await confirmDialog({
      title: `Excluir "${income.description}"?`,
      message: "Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.from("finance_incomes").delete().eq("id", income.id);
    if (!error) setIncomes((prev) => prev.filter((i) => i.id !== income.id));
    else await alertDialog({ title: "Não foi possível excluir", message: "Tente novamente.", tone: "danger" });
  }

  async function addExpense() {
    const amount_cents = inputToCents(expenseAmount);
    if (!expenseDesc.trim() || amount_cents <= 0) return;
    setSavingExpense(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("finance_expenses")
      .insert({
        edition_id: selectedEditionId,
        description: expenseDesc.trim(),
        amount_cents,
        status: expenseStatus,
      })
      .select("*")
      .single();
    setSavingExpense(false);
    if (!error && data) {
      setExpenses((prev) => [data as FinanceExpense, ...prev]);
      setExpenseDesc("");
      setExpenseAmount("");
      setExpenseStatus("previsto");
    }
  }

  async function updateExpense(expense: FinanceExpense, patch: Partial<FinanceExpense>) {
    setExpenses((prev) => prev.map((e) => (e.id === expense.id ? { ...e, ...patch } : e)));
    const supabase = createClient();
    await supabase
      .from("finance_expenses")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", expense.id);
  }

  async function moveExpenseToIncome(expense: FinanceExpense) {
    const supabase = createClient();
    const { data: newIncome, error: insertError } = await supabase
      .from("finance_incomes")
      .insert({
        edition_id: expense.edition_id,
        description: expense.description,
        amount_cents: expense.amount_cents,
        payment_method: "pix",
      })
      .select("*")
      .single();
    if (insertError || !newIncome) {
      await alertDialog({ title: "Não foi possível mover", message: "Tente novamente em instantes.", tone: "danger" });
      return;
    }
    const { error: deleteError } = await supabase.from("finance_expenses").delete().eq("id", expense.id);
    if (deleteError) {
      await supabase.from("finance_incomes").delete().eq("id", newIncome.id);
      await alertDialog({ title: "Não foi possível mover", message: "Tente novamente em instantes.", tone: "danger" });
      return;
    }
    setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
    setIncomes((prev) => [newIncome as FinanceIncome, ...prev]);
  }

  async function deleteExpense(expense: FinanceExpense) {
    const ok = await confirmDialog({
      title: `Excluir "${expense.description}"?`,
      message: "Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.from("finance_expenses").delete().eq("id", expense.id);
    if (!error) setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
    else await alertDialog({ title: "Não foi possível excluir", message: "Tente novamente.", tone: "danger" });
  }

  async function unconfirmOrderPayment(orderId: string, customerName: string) {
    const ok = await confirmDialog({
      title: `Remover recebimento de "${customerName}"?`,
      message: "O pedido volta para \"em aberto\" e pode ser confirmado de novo depois.",
      confirmLabel: "Remover",
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_unconfirm_order_payment", { p_order_id: orderId });
    if (error) {
      await alertDialog({ title: "Não foi possível remover", message: "Tente novamente em instantes.", tone: "danger" });
      return;
    }
    router.refresh();
  }

  async function deleteLedgerRow(row: (typeof ledger)[number]) {
    if (row.kind === "Pedido do site") {
      await unconfirmOrderPayment(row.id.slice("order-".length), row.description);
      return;
    }
    if (row.kind === "Entrada manual") {
      const income = incomes.find((i) => i.id === row.id.slice("income-".length));
      if (income) await deleteIncome(income);
      return;
    }
    const expense = expenses.find((e) => e.id === row.id.slice("expense-".length));
    if (expense) await deleteExpense(expense);
  }

  const usedSuggestions = useMemo(
    () => new Set(expenses.map((e) => e.description.trim().toLowerCase())),
    [expenses]
  );

  const summary = useMemo(() => {
    const manualIncomeTotal = incomes.reduce((sum, i) => sum + i.amount_cents, 0);
    const orderIncomeTotal = orderIncomes.reduce((sum, o) => sum + o.total_cents, 0);
    const totalReceived = manualIncomeTotal + orderIncomeTotal;
    const expensesPrevisto = expenses
      .filter((e) => e.status === "previsto")
      .reduce((sum, e) => sum + e.amount_cents, 0);
    const expensesPago = expenses.filter((e) => e.status === "pago").reduce((sum, e) => sum + e.amount_cents, 0);
    const expensesTotal = expensesPrevisto + expensesPago;
    return {
      totalReceived,
      orderIncomeTotal,
      expensesPrevisto,
      expensesPago,
      expensesTotal,
      sobraEstimada: projected - expensesTotal,
      sobraAtual: totalReceived - expensesPago,
    };
  }, [incomes, expenses, orderIncomes, projected]);

  const ledger = useMemo(() => {
    const rows: {
      id: string;
      date: string;
      kind: "Pedido do site" | "Entrada manual" | "Despesa";
      description: string;
      detail: string;
      amountCents: number;
      sign: 1 | -1;
    }[] = [];
    for (const o of orderIncomes) {
      rows.push({
        id: `order-${o.id}`,
        date: o.payment_confirmed_at ?? o.created_at,
        kind: "Pedido do site",
        description: o.customer_name,
        detail:
          PAYMENT_METHOD_LABEL[o.payment_method] +
          (o.payment_confirmed_by ? ` · confirmado por ${o.payment_confirmed_by}` : ""),
        amountCents: o.total_cents,
        sign: 1,
      });
    }
    for (const i of incomes) {
      rows.push({
        id: `income-${i.id}`,
        date: i.created_at,
        kind: "Entrada manual",
        description: i.description,
        detail: FINANCE_PAYMENT_METHOD_LABEL[i.payment_method],
        amountCents: i.amount_cents,
        sign: 1,
      });
    }
    for (const e of expenses) {
      rows.push({
        id: `expense-${e.id}`,
        date: e.created_at,
        kind: "Despesa",
        description: e.description,
        detail: FINANCE_EXPENSE_STATUS_LABEL[e.status],
        amountCents: e.amount_cents,
        sign: -1,
      });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [orderIncomes, incomes, expenses]);

  function exportCsv() {
    const editionTitle = editions.find((e) => e.id === selectedEditionId)?.title ?? "edicao";
    const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(["Resumo", ""].map(csvCell).join(";"));
    lines.push(["Faturamento previsto", (projected / 100).toFixed(2).replace(".", ",")].map(csvCell).join(";"));
    lines.push(
      ["Total recebido", (summary.totalReceived / 100).toFixed(2).replace(".", ",")].map(csvCell).join(";")
    );
    lines.push(
      ["Em aberto (a receber)", (openAmountCents / 100).toFixed(2).replace(".", ",")].map(csvCell).join(";")
    );
    lines.push(
      ["Total de despesas", (summary.expensesTotal / 100).toFixed(2).replace(".", ",")].map(csvCell).join(";")
    );
    lines.push(
      ["Total já pago", (summary.expensesPago / 100).toFixed(2).replace(".", ",")].map(csvCell).join(";")
    );
    lines.push(
      ["Sobra estimada", (summary.sobraEstimada / 100).toFixed(2).replace(".", ",")].map(csvCell).join(";")
    );
    lines.push(
      ["Sobra atual em caixa", (summary.sobraAtual / 100).toFixed(2).replace(".", ",")].map(csvCell).join(";")
    );
    lines.push("");
    lines.push(["Data", "Tipo", "Descrição", "Detalhe", "Valor (R$)"].map(csvCell).join(";"));
    for (const row of ledger) {
      const signedValue = ((row.sign * row.amountCents) / 100).toFixed(2).replace(".", ",");
      lines.push(
        [formatDateTime(row.date), row.kind, row.description, row.detail, signedValue]
          .map(csvCell)
          .join(";")
      );
    }
    const csv = "﻿" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeiro-${editionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!selectedEditionId) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center text-sm text-coffee-soft">
        Crie uma edição primeiro para usar o Financeiro.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-coffee">Financeiro</h1>
        <select
          value={selectedEditionId}
          onChange={(e) => router.push(`/admin/financeiro?edition=${e.target.value}`)}
          className="min-h-11 rounded-xl border border-coffee/10 bg-white px-3 py-2 text-sm font-semibold text-coffee"
        >
          {editions.map((ed) => (
            <option key={ed.id} value={ed.id}>
              {ed.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Faturamento previsto" value={formatCents(projected)} />
        <SummaryCard label="Total recebido" value={formatCents(summary.totalReceived)} tone="success" />
        <SummaryCard
          label="Em aberto (a receber)"
          value={formatCents(openAmountCents)}
          sub="Pedidos feitos, ainda não pagos"
          tone={openAmountCents > 0 ? "danger" : "neutral"}
        />
        <SummaryCard
          label="Total de despesas"
          value={formatCents(summary.expensesTotal)}
          sub={`Previstas ${formatCents(summary.expensesPrevisto)} · Pagas ${formatCents(summary.expensesPago)}`}
        />
        <SummaryCard label="Total já pago" value={formatCents(summary.expensesPago)} tone="danger" />
        <SummaryCard
          label="Sobra estimada"
          value={formatCents(summary.sobraEstimada)}
          tone={summary.sobraEstimada >= 0 ? "success" : "danger"}
        />
        <SummaryCard
          label="Sobra atual em caixa"
          value={formatCents(summary.sobraAtual)}
          tone={summary.sobraAtual >= 0 ? "success" : "danger"}
        />
      </div>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Faturamento previsto
        </h2>
        <p className="text-xs text-coffee-soft">
          Quanto você venderia se esgotasse todo o estoque dessa edição. Isso não conta como
          recebido — é só a meta.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-coffee/10 bg-cream-soft px-3 py-2">
            <span className="text-sm font-bold text-coffee-soft">R$</span>
            <input
              value={projectedInput}
              onChange={(e) => setProjectedInput(e.target.value)}
              onBlur={saveProjected}
              inputMode="decimal"
              className="w-28 bg-transparent text-sm font-bold text-coffee outline-none"
              style={{ fontSize: 16 }}
            />
          </div>
          <button
            onClick={useSuggestion}
            className="min-h-11 rounded-xl bg-orange-soft px-3 text-xs font-bold text-orange-dark"
          >
            Usar sugestão ({formatCents(suggestedProjectedCents)})
          </button>
          {savingProjected && <span className="text-xs text-coffee-soft">Salvando…</span>}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border-l-4 border-success bg-white p-4">
        <h2 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-success">
          <span>💰</span> Entradas recebidas (dinheiro que entrou)
        </h2>
        <p className="text-xs text-coffee-soft">
          Pedidos pagos pelo site entram aqui automaticamente. Use o formulário abaixo só para
          dinheiro recebido fora do site (ex.: venda direta, gorjeta, pedido combinado por
          WhatsApp).
        </p>

        {windows.length > 0 && (
          <div className="flex flex-col gap-2">
            {windows.map((w) => {
              const windowPending = pendingByWindow.get(w.id) ?? [];
              const isOpen = openWindowId === w.id;
              return (
                <div key={w.id} className="overflow-hidden rounded-xl border border-coffee/10">
                  <button
                    onClick={() => setOpenWindowId(isOpen ? null : w.id)}
                    className="flex w-full items-center justify-between gap-2 bg-cream-soft px-3 py-2.5 text-left"
                  >
                    <span className="text-sm font-bold text-coffee">{w.label}</span>
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          windowPending.length > 0 ? "bg-warning-bg text-warning" : "bg-success-bg text-success"
                        }`}
                      >
                        {windowPending.length > 0
                          ? `${windowPending.length} a receber`
                          : "Tudo registrado"}
                      </span>
                      <span className="text-coffee-soft">{isOpen ? "▾" : "▸"}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-1 p-2">
                      {windowPending.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-coffee-soft">
                          Nenhum pedido pendente nessa janela.
                        </p>
                      ) : (
                        windowPending.map((order) => {
                          const confirmed = confirmedPaymentByOrderId[order.id] as PaymentMethod | undefined;
                          const isSelected = selectedOrderId === order.id;
                          return (
                            <button
                              key={order.id}
                              onClick={() => selectOrderForConfirm(order)}
                              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                isSelected ? "bg-orange-soft/40" : "hover:bg-cream-soft"
                              }`}
                            >
                              <div>
                                <p className="font-bold text-coffee">{order.customer_name}</p>
                                <p className="text-xs text-coffee-soft">
                                  {PAYMENT_METHOD_LABEL[confirmed ?? order.payment_method]}
                                  {confirmed && confirmed !== order.payment_method && " · confirmado pelo motoboy"}
                                  {isSelected && " · preencha abaixo e confirme"}
                                </p>
                              </div>
                              <span className="font-bold text-coffee">{formatCents(order.total_cents)}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selectedOrderId && (
          <p className="-mb-1 rounded-lg bg-orange-soft/50 px-3 py-2 text-xs font-semibold text-orange-dark">
            Confirmando recebimento do pedido selecionado — ajuste a forma de pagamento se precisar e clique em
            Confirmar.
          </p>
        )}
        <div className="flex flex-col gap-2 rounded-xl bg-cream-soft p-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-bold text-coffee-soft">Descrição</label>
            <input
              value={incomeDesc}
              onChange={(e) => setIncomeDesc(e.target.value)}
              placeholder="Ex.: Venda avulsa no balcão"
              className="min-h-11 rounded-lg border border-coffee/10 bg-white px-3 py-2 text-sm"
              style={{ fontSize: 16 }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-coffee-soft">Valor (R$)</label>
            <input
              value={incomeAmount}
              onChange={(e) => setIncomeAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              disabled={!!selectedOrderId}
              className="min-h-11 w-28 rounded-lg border border-coffee/10 bg-white px-3 py-2 text-sm disabled:opacity-60"
              style={{ fontSize: 16 }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-coffee-soft">Forma</label>
            <select
              value={incomeMethod}
              onChange={(e) => setIncomeMethod(e.target.value as FinancePaymentMethod)}
              className="min-h-11 rounded-lg border border-coffee/10 bg-white px-3 py-2 text-sm"
            >
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartao">Cartão</option>
            </select>
          </div>
          <button
            onClick={addIncome}
            disabled={savingIncome}
            className="min-h-11 rounded-lg bg-success px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {selectedOrderId ? "Confirmar recebimento" : "+ Registrar entrada"}
          </button>
        </div>
        {incomes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {incomes.map((income) => (
              <div
                key={income.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-coffee/10 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-bold text-coffee">{income.description}</p>
                  <p className="text-xs text-coffee-soft">
                    {FINANCE_PAYMENT_METHOD_LABEL[income.payment_method]} ·{" "}
                    {formatDateTime(income.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-success">{formatCents(income.amount_cents)}</span>
                  <button
                    onClick={() => moveIncomeToExpense(income)}
                    className="min-h-9 rounded-lg bg-cream-soft px-2.5 text-xs font-bold text-coffee-soft hover:text-coffee"
                  >
                    Era despesa?
                  </button>
                  <button
                    onClick={() => deleteIncome(income)}
                    aria-label="Excluir"
                    className="min-h-9 rounded-lg bg-danger-bg px-2.5 text-xs font-bold text-danger"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border-l-4 border-danger bg-white p-4">
        <h2 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-danger">
          <span>🛒</span> Despesas (dinheiro que saiu)
        </h2>
        <p className="text-xs text-coffee-soft">
          Lance item por item, com o valor de cada um — é assim que dá pra calcular depois o
          custo de cada lanche (a chamada &ldquo;ficha técnica&rdquo;).
        </p>
        <div className="flex flex-col gap-2">
          {EXPENSE_SUGGESTION_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-coffee-soft/70">
                {group.label}:
              </span>
              {group.items.map((item) => {
                const used = usedSuggestions.has(item.toLowerCase());
                return (
                  <button
                    key={item}
                    onClick={() => setExpenseDesc(item)}
                    className={
                      used
                        ? "rounded-full bg-danger-bg/60 px-3 py-1.5 text-xs font-semibold text-danger/60"
                        : "rounded-full bg-cream-soft px-3 py-1.5 text-xs font-semibold text-coffee-soft hover:bg-orange-soft hover:text-orange-dark"
                    }
                  >
                    {used ? "✓ " : ""}
                    {item}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-cream-soft p-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-bold text-coffee-soft">Descrição</label>
            <input
              value={expenseDesc}
              onChange={(e) => setExpenseDesc(e.target.value)}
              placeholder="Ex.: Carne, pão, cheddar e bacon"
              className="min-h-11 rounded-lg border border-coffee/10 bg-white px-3 py-2 text-sm"
              style={{ fontSize: 16 }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-coffee-soft">Valor total (R$)</label>
            <input
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="min-h-11 w-28 rounded-lg border border-coffee/10 bg-white px-3 py-2 text-sm"
              style={{ fontSize: 16 }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-coffee-soft">Situação</label>
            <select
              value={expenseStatus}
              onChange={(e) => setExpenseStatus(e.target.value as FinanceExpenseStatus)}
              className="min-h-11 rounded-lg border border-coffee/10 bg-white px-3 py-2 text-sm"
            >
              <option value="previsto">Previsto</option>
              <option value="pago">Pago</option>
            </select>
          </div>
          <button
            onClick={addExpense}
            disabled={savingExpense}
            className="min-h-11 rounded-lg bg-danger px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            + Registrar despesa
          </button>
        </div>
        {expenses.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex flex-col gap-2 rounded-lg border border-coffee/10 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <input
                  defaultValue={expense.description}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== expense.description) {
                      updateExpense(expense, { description: e.target.value.trim() });
                    }
                  }}
                  className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1 font-bold text-coffee outline-none focus:bg-cream-soft"
                  style={{ fontSize: 16 }}
                />
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-lg bg-cream-soft px-2 py-1">
                    <span className="text-xs font-bold text-coffee-soft">R$</span>
                    <input
                      defaultValue={centsToInput(expense.amount_cents)}
                      onBlur={(e) => updateExpense(expense, { amount_cents: inputToCents(e.target.value) })}
                      inputMode="decimal"
                      className="w-20 bg-transparent text-sm font-bold text-coffee outline-none"
                      style={{ fontSize: 16 }}
                    />
                  </div>
                  <select
                    value={expense.status}
                    onChange={(e) =>
                      updateExpense(expense, { status: e.target.value as FinanceExpenseStatus })
                    }
                    className={`min-h-9 rounded-lg border px-2 py-1 text-xs font-bold ${
                      expense.status === "pago"
                        ? "border-success/20 bg-success-bg text-success"
                        : "border-warning/20 bg-warning-bg text-warning"
                    }`}
                  >
                    <option value="previsto">Previsto</option>
                    <option value="pago">Pago</option>
                  </select>
                  <button
                    onClick={() => moveExpenseToIncome(expense)}
                    className="min-h-9 rounded-lg bg-cream-soft px-2.5 text-xs font-bold text-coffee-soft hover:text-coffee"
                  >
                    Era entrada?
                  </button>
                  <button
                    onClick={() => deleteExpense(expense)}
                    aria-label="Excluir"
                    className="min-h-9 rounded-lg bg-danger-bg px-2.5 text-xs font-bold text-danger"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
            Todos os lançamentos
          </h2>
          <button onClick={exportCsv} className="text-sm font-bold text-orange">
            Exportar CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-cream-soft text-left text-xs font-bold uppercase tracking-wide text-coffee-soft">
                <th className="py-2 pr-2">Data</th>
                <th className="py-2 pr-2">Tipo</th>
                <th className="py-2 pr-2">Descrição</th>
                <th className="py-2 pr-2">Detalhe</th>
                <th className="py-2 pr-2 text-right">Valor</th>
                <th className="py-2 text-right">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-coffee-soft">
                    Nenhum lançamento ainda.
                  </td>
                </tr>
              )}
              {ledger.map((row) => (
                <tr key={row.id} className="border-b border-cream-soft last:border-0">
                  <td className="py-2 pr-2 text-xs text-coffee-soft">{formatDateTime(row.date)}</td>
                  <td className="py-2 pr-2 text-xs text-coffee-soft">{row.kind}</td>
                  <td className="py-2 pr-2 font-semibold text-coffee">{row.description}</td>
                  <td className="py-2 pr-2 text-xs text-coffee-soft">{row.detail}</td>
                  <td
                    className={`py-2 pr-2 text-right font-bold ${row.sign === 1 ? "text-success" : "text-danger"}`}
                  >
                    {row.sign === 1 ? "+" : "−"} {formatCents(row.amountCents)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => deleteLedgerRow(row)}
                      aria-label="Remover"
                      className="min-h-9 rounded-lg bg-danger-bg px-2.5 text-xs font-bold text-danger"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-coffee";
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white p-3.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-coffee-soft">{label}</span>
      <span className={`text-lg font-extrabold ${toneClass}`}>{value}</span>
      {sub && <span className="text-[11px] text-coffee-soft">{sub}</span>}
    </div>
  );
}
