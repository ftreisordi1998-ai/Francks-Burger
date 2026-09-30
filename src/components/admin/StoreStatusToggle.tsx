"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ToggleSwitch } from "./ToggleSwitch";
import type { Edition } from "@/lib/types";

export function StoreStatusToggle({ edition: initial }: { edition: Edition | null }) {
  const [edition, setEdition] = useState(initial);
  const [busy, setBusy] = useState(false);

  if (!edition) {
    return (
      <div className="flex items-center justify-between rounded-2xl bg-white p-4">
        <div>
          <p className="text-sm font-bold text-coffee">Nenhuma edição publicada</p>
          <p className="text-xs text-coffee-soft">Crie uma edição para começar a receber pedidos.</p>
        </div>
        <Link href="/admin/edicoes" className="text-sm font-bold text-orange">
          Ir para edições →
        </Link>
      </div>
    );
  }

  const isOpen = edition.status === "open";

  async function toggle(next: boolean) {
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("editions")
      .update({ status: next ? "open" : "closed" })
      .eq("id", edition!.id)
      .select("*")
      .single();
    setBusy(false);
    if (!error && data) setEdition(data as Edition);
  }

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-2xl p-4 transition-colors ${
        isOpen ? "bg-success-bg" : "bg-cream-soft"
      }`}
    >
      <div>
        <p className={`text-sm font-extrabold ${isOpen ? "text-success" : "text-coffee-soft"}`}>
          {isOpen ? "Loja aberta" : "Loja fechada"}
        </p>
        <p className="text-xs text-coffee-soft">
          {edition.title} · {isOpen ? "recebendo encomendas" : "não está recebendo encomendas"}
        </p>
      </div>
      <ToggleSwitch checked={isOpen} onChange={toggle} disabled={busy} />
    </div>
  );
}
