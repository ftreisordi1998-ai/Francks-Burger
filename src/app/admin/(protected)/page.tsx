import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/Badge";
import { formatCents, formatDateShort } from "@/lib/format";
import { getEditionSituation, SITUATION_LABEL, SITUATION_TONE } from "@/lib/edition-state";
import type { Edition, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const supabase = await createClient();

  const { data: editions } = await supabase
    .from("editions")
    .select("*")
    .order("prep_date", { ascending: false })
    .limit(1);

  const edition = editions?.[0] as Edition | undefined;

  if (!edition) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center text-sm text-coffee-soft">
        Nenhuma edição cadastrada ainda.{" "}
        <Link href="/admin/edicoes" className="font-bold text-orange">
          Criar a primeira
        </Link>
      </div>
    );
  }

  const [{ data: products }, { data: windows }, { data: orders }] = await Promise.all([
    supabase.from("products").select("*").eq("edition_id", edition.id).eq("active", true),
    supabase
      .from("delivery_windows")
      .select("id, label, starts_at, capacity_burgers, reserved_burgers")
      .eq("edition_id", edition.id)
      .eq("active", true)
      .order("starts_at", { ascending: true }),
    supabase
      .from("orders")
      .select("order_status, payment_status, total_cents")
      .eq("edition_id", edition.id),
  ]);

  const situation = edition.status === "draft" ? null : getEditionSituation(edition, (products ?? []) as Product[]);

  const stockAvailable = (products ?? []).reduce((sum, p) => sum + p.available_qty, 0);
  const stockTotal = (products ?? []).reduce((sum, p) => sum + p.stock_qty, 0);

  const activeOrders = (orders ?? []).filter((o) => o.order_status !== "cancelled");
  const totalReceived = (orders ?? [])
    .filter((o) => o.payment_status === "paid")
    .reduce((sum, o) => sum + o.total_cents, 0);

  const now = Date.now();
  const nextWindow = (windows ?? []).find(
    (w) => new Date(w.starts_at).getTime() > now && w.reserved_burgers < w.capacity_burgers
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-coffee">Olá! 👋</h1>
        <p className="text-sm text-coffee-soft">Resumo rápido da edição mais recente.</p>
      </div>

      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-coffee">{edition.title}</h2>
            <p className="text-xs text-coffee-soft">Preparo em {formatDateShort(edition.prep_date)}</p>
          </div>
          <Badge tone={situation ? SITUATION_TONE[situation] : "warning"}>
            {situation ? SITUATION_LABEL[situation] : "Rascunho (não visível)"}
          </Badge>
        </div>
        <Link href={`/admin/edicoes/${edition.id}`} className="text-xs font-bold text-orange">
          Editar esta edição →
        </Link>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Pedidos ativos" value={String(activeOrders.length)} href="/admin/pedidos" />
        <StatCard label="Recebido" value={formatCents(totalReceived)} href="/admin/financeiro" />
        <StatCard
          label="Estoque restante"
          value={`${stockAvailable} / ${stockTotal}`}
          href="/admin/edicoes"
        />
        <StatCard
          label="Próxima janela"
          value={nextWindow ? nextWindow.label : "—"}
          sub={
            nextWindow
              ? `${nextWindow.capacity_burgers - nextWindow.reserved_burgers} vagas livres`
              : "Sem vagas futuras"
          }
          href="/admin/producao"
        />
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLink href="/admin/pedidos" label="Ver pedidos" />
        <QuickLink href="/admin/producao" label="Ir pra produção" />
        <QuickLink href="/admin/edicoes" label="Gerenciar edições" />
        <QuickLink href="/admin/financeiro" label="Abrir financeiro" />
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href: string;
}) {
  return (
    <Link href={href} className="flex flex-col gap-1 rounded-2xl bg-white p-3.5 hover:ring-2 hover:ring-orange/30">
      <span className="text-[11px] font-bold uppercase tracking-wide text-coffee-soft">{label}</span>
      <span className="text-lg font-extrabold text-coffee">{value}</span>
      {sub && <span className="text-[11px] text-coffee-soft">{sub}</span>}
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center justify-center rounded-xl bg-orange-soft px-3 text-center text-sm font-bold text-orange-dark"
    >
      {label}
    </Link>
  );
}
