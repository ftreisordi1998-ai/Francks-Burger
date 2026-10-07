"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "@/lib/dialog-context";
import { createClient } from "@/lib/supabase/client";
import { formatCents, formatDateTime } from "@/lib/format";
import { FINANCE_EXPENSE_STATUS_LABEL, FINANCE_PAYMENT_METHOD_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/status";
import type {
  EditionOption,
  FinanceExpense,
  FinanceExpenseStatus,
  FinanceIncome,
  FinancePaymentMethod,
  OrderIncomeRow,
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

export function FinanceiroScreen({
  editions,
  selectedEditionId,
  projectedRevenueCents,
  suggestedProjectedCents,
  incomes: initialIncomes,
  expenses: initialExpenses,
  orderIncomes,
}: {
  editions: EditionOption[];
  selectedEditionId: string;
  projectedRevenueCents: number | null;
  suggestedProjectedCents: number;
  incomes: FinanceIncome[];
  expenses: FinanceExpense[];
  orderIncomes: OrderIncomeRow[];
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
        date: o.created_at,
        kind: "Pedido do site",
        description: o.customer_name,
        detail: PAYMENT_METHOD_LABEL[o.payment_method],
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

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Entradas recebidas
        </h2>
        <p className="text-xs text-coffee-soft">
          Pedidos pagos pelo site entram aqui automaticamente. Use o formulário abaixo só para
          dinheiro recebido fora do site (ex.: venda direta, gorjeta).
        </p>
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
              className="min-h-11 w-28 rounded-lg border border-coffee/10 bg-white px-3 py-2 text-sm"
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
            className="min-h-11 rounded-lg bg-orange px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            + Adicionar
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

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">Despesas</h2>
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
              {group.items.map((item) => (
                <button
                  key={item}
                  onClick={() => setExpenseDesc(item)}
                  className="rounded-full bg-cream-soft px-3 py-1.5 text-xs font-semibold text-coffee-soft hover:bg-orange-soft hover:text-orange-dark"
                >
                  {item}
                </button>
              ))}
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
            className="min-h-11 rounded-lg bg-orange px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            + Adicionar
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
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Todos os lançamentos
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-cream-soft text-left text-xs font-bold uppercase tracking-wide text-coffee-soft">
                <th className="py-2 pr-2">Data</th>
                <th className="py-2 pr-2">Tipo</th>
                <th className="py-2 pr-2">Descrição</th>
                <th className="py-2 pr-2">Detalhe</th>
                <th className="py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-coffee-soft">
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
                    className={`py-2 text-right font-bold ${row.sign === 1 ? "text-success" : "text-danger"}`}
                  >
                    {row.sign === 1 ? "+" : "−"} {formatCents(row.amountCents)}
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
