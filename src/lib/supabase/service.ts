import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com service role: ignora RLS. Só pode existir em código de servidor
// (rotas de API) que recebe eventos sem sessão de usuário — o webhook do
// Mercado Pago e a rotina de conciliação. Nunca importar de componente.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_NOT_CONFIGURED");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
