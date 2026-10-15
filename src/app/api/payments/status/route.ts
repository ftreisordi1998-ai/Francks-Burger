import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { onlinePaymentsEnabled } from "@/lib/mercadopago/config";
import { syncAttemptFromProvider } from "@/lib/mercadopago/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Estado do pagamento para a tela do cliente. O navegador consulta AQUI (e
// não o provedor). Se a tentativa ainda está aberta e faz tempo que não
// sincroniza, reconsultamos o provedor — assim um webhook atrasado não deixa
// o cliente olhando para um QR já pago.

const TOKEN_RE = /^[a-f0-9]{16,64}$/i;
const SYNC_IF_OLDER_THAN_MS = 20_000;

export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNEXPECTED";
    console.error("[payments/status]", code);
    const isConfig = code.endsWith("_NOT_CONFIGURED");
    return NextResponse.json(
      { error: isConfig ? "PAYMENTS_NOT_CONFIGURED" : "UNEXPECTED_ERROR" },
      { status: isConfig ? 503 : 500 }
    );
  }
}

async function handle(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });

  const db = createServiceClient();
  const { data: state, error } = await db.rpc("get_order_payment_state", { p_token: token });
  if (error) return NextResponse.json({ error: "STATE_FAILED" }, { status: 500 });
  if (!state) return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

  const attempt = (state as { attempt: { id: string; status: string; provider_payment_id: string | null } | null }).attempt;
  const open = attempt && ["pending", "in_process", "authorized", "in_mediation"].includes(attempt.status);

  if (onlinePaymentsEnabled() && open && attempt?.provider_payment_id) {
    const { data: row } = await db
      .from("payment_attempts")
      .select("last_synced_at")
      .eq("id", attempt.id)
      .single();
    const last = row?.last_synced_at ? new Date(row.last_synced_at as string).getTime() : 0;
    if (Date.now() - last > SYNC_IF_OLDER_THAN_MS) {
      try {
        await syncAttemptFromProvider(db, attempt.id, attempt.provider_payment_id);
        const refreshed = await db.rpc("get_order_payment_state", { p_token: token });
        if (refreshed.data) return NextResponse.json(refreshed.data, { headers: { "Cache-Control": "no-store" } });
      } catch {
        // Falha ao consultar o provedor não derruba a tela: devolve o estado
        // que temos e a conciliação cuida depois.
      }
    }
  }

  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
