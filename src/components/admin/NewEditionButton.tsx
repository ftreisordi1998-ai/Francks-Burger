"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function NewEditionButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function createEdition() {
    setBusy(true);
    const supabase = createClient();
    const inFiveDays = new Date(Date.now() + 5 * 86400000);
    const deadline = new Date(Date.now() + 4 * 86400000);
    const { data, error } = await supabase
      .from("editions")
      .insert({
        title: "Nova edição",
        prep_date: inFiveDays.toISOString().slice(0, 10),
        order_deadline: deadline.toISOString(),
        status: "draft",
      })
      .select("id")
      .single();
    setBusy(false);
    if (!error && data) {
      router.push(`/admin/edicoes/${data.id}`);
    }
  }

  return (
    <button
      onClick={createEdition}
      disabled={busy}
      className="rounded-xl bg-orange px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
    >
      + Nova edição
    </button>
  );
}
