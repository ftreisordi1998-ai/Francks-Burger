import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { reconcileSecret } from "@/lib/mercadopago/config";
import { searchPaymentsByExternalReference, toCents } from "@/lib/mercadopago/client";
import { applyPaymentToAttempt, syncAttemptFromProvider } from "@/lib/mercadopago/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Conciliação periódica (chamada pelo pg_cron via pg_net, ou manualmente).
// Cobre tudo que o webhook pode ter perdido: notificações não entregues,
// criações sem resposta e reservas de pedidos online que venceram.
// Só libera reserva DEPOIS de sincronizar com o provedor.

const MAX_ITEMS_PER_RUN = 50;
const CREATION_GIVE_UP_MS = 10 * 60_000;

function authorized(req: NextRequest): boolean {
  const secret = reconcileSecret();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function run() {
  const db = createServiceClient();
  const summary = { synced: 0, bound: 0, creation_failed: 0, released: 0, errors: [] as string[] };

  const { data: candidates, error } = await db.rpc("list_mp_reconciliation_candidates", {
    p_stale_after_seconds: 90,
  });
  if (error) throw new Error(`CANDIDATES_FAILED: ${error.message}`);

  const openAttempts = ((candidates as { open_attempts?: Array<Record<string, unknown>> })?.open_attempts ?? []).slice(
    0,
    MAX_ITEMS_PER_RUN
  );
  const expiredOrders = ((candidates as { expired_orders?: string[] })?.expired_orders ?? []).slice(0, MAX_ITEMS_PER_RUN);

  for (const a of openAttempts) {
    const attemptId = String(a.attempt_id);
    try {
      if (a.provider_payment_id) {
        await syncAttemptFromProvider(db, attemptId, String(a.provider_payment_id));
        summary.synced += 1;
        continue;
      }

      // Criação sem id: a chamada ao provedor pode ter dado timeout depois de
      // criar. Procuramos pelo external_reference (= id do pedido).
      const { data: row } = await db
        .from("payment_attempts")
        .select("method, amount_cents, created_at")
        .eq("id", attemptId)
        .single();
      const found = await searchPaymentsByExternalReference(String(a.order_id));
      const match = found.find(
        (p) =>
          (p.payment_method_id === "pix" ? "pix" : "credit_card") === row?.method &&
          toCents(p.transaction_amount) === row?.amount_cents &&
          new Date(p.date_created).getTime() >= new Date(String(row?.created_at)).getTime() - 60_000
      );
      if (match) {
        await db
          .from("payment_attempts")
          .update({ provider_payment_id: String(match.id) })
          .eq("id", attemptId)
          .is("provider_payment_id", null);
        await applyPaymentToAttempt(db, attemptId, match);
        summary.bound += 1;
        continue;
      }

      const ageMs = Date.now() - new Date(String(row?.created_at)).getTime();
      if (ageMs > CREATION_GIVE_UP_MS) {
        await db
          .from("payment_attempts")
          .update({ status: "cancelled", status_detail: "creation_failed", last_synced_at: new Date().toISOString() })
          .eq("id", attemptId)
          .eq("status", "creating");
        summary.creation_failed += 1;
      } else {
        await db.from("payment_attempts").update({ last_synced_at: new Date().toISOString() }).eq("id", attemptId);
      }
    } catch (err) {
      summary.errors.push(`${attemptId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const orderId of expiredOrders) {
    try {
      const { data } = await db.rpc("release_mp_order_if_unpaid", { p_order_id: orderId });
      if ((data as { released?: boolean })?.released) summary.released += 1;
    } catch (err) {
      summary.errors.push(`order ${orderId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return summary;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    return NextResponse.json(await run());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "RECONCILE_FAILED" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
