"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl bg-white/10 py-3 pl-4 pr-12 text-cream placeholder:text-cream/40 outline-none focus:ring-2 focus:ring-orange"
            style={{ fontSize: 16 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-cream/60 hover:text-cream"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
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

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-6.5 0-10-8-10-8a19.4 19.4 0 0 1 4.22-5.77M9.9 4.24A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a19.5 19.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2 2l20 20" strokeLinecap="round" />
    </svg>
  );
}
