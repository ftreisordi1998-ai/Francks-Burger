"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { data: adminRow } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userData.user?.id)
      .maybeSingle();

    if (!adminRow) {
      await supabase.auth.signOut();
      setError("Esta conta não tem acesso ao painel administrativo.");
      setLoading(false);
      return;
    }

    router.push("/admin/pedidos");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-coffee px-6">
      <Logo size={64} />
      <h1 className="mt-4 text-lg font-extrabold text-cream">Painel administrativo</h1>
      <form onSubmit={handleSubmit} className="mt-8 flex w-full max-w-sm flex-col gap-3.5">
        <input
          type="email"
          required
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl bg-white/10 px-4 py-3 text-cream placeholder:text-cream/40 outline-none focus:ring-2 focus:ring-orange"
          style={{ fontSize: 16 }}
        />
        <input
          type="password"
          required
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl bg-white/10 px-4 py-3 text-cream placeholder:text-cream/40 outline-none focus:ring-2 focus:ring-orange"
          style={{ fontSize: 16 }}
        />
        {error && <p className="text-sm font-medium text-orange-soft">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-xl bg-orange py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
