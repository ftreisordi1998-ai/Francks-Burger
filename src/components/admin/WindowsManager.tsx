"use client";

import { createClient } from "@/lib/supabase/client";
import { useDialog } from "@/lib/dialog-context";
import type { DeliveryWindow, WindowType } from "@/lib/types";

export function WindowsManager({
  editionId,
  windows,
  onChange,
}: {
  editionId: string;
  windows: DeliveryWindow[];
  onChange: (windows: DeliveryWindow[]) => void;
}) {
  const { confirmDialog, alertDialog } = useDialog();
  async function addWindow(type: WindowType) {
    const supabase = createClient();
    const now = new Date();
    const start = new Date(now.getTime() + 5 * 86400000);
    const end = new Date(start.getTime() + 3 * 3600000);
    const { data, error } = await supabase
      .from("delivery_windows")
      .insert({
        edition_id: editionId,
        type,
        label: type === "delivery" ? "Nova janela de entrega" : "Nova janela de retirada",
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        capacity_burgers: 20,
      })
      .select("*")
      .single();
    if (!error && data) onChange([...windows, data as DeliveryWindow]);
  }

  function updateLocal(id: string, patch: Partial<DeliveryWindow>) {
    onChange(windows.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }

  async function save(window: DeliveryWindow, patch: Partial<DeliveryWindow>) {
    if (patch.capacity_burgers !== undefined && patch.capacity_burgers < window.reserved_burgers) {
      await alertDialog({
        title: "Capacidade inválida",
        message: `Não é possível reduzir a capacidade abaixo do já reservado (${window.reserved_burgers}).`,
        tone: "danger",
      });
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("delivery_windows")
      .update(patch)
      .eq("id", window.id)
      .select("*")
      .single();
    if (!error && data) updateLocal(window.id, data as DeliveryWindow);
  }

  async function handleDelete(window: DeliveryWindow) {
    const ok = await confirmDialog({
      title: `Excluir "${window.label}"?`,
      message: "Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.from("delivery_windows").delete().eq("id", window.id);
    if (error) {
      if (error.code === "23503") {
        await alertDialog({
          title: "Não é possível excluir",
          message: `"${window.label}" já tem pedidos associados. Desative-a (desmarque "Ativa") para tirá-la das opções sem apagar o histórico.`,
          tone: "danger",
        });
      } else {
        await alertDialog({
          title: "Não foi possível excluir",
          message: "Tente novamente em instantes.",
          tone: "danger",
        });
      }
      return;
    }
    onChange(windows.filter((w) => w.id !== window.id));
  }

  return (
    <section className="mt-4 flex flex-col gap-4 rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-coffee-soft">
          Janelas de entrega e retirada
        </h2>
        <div className="flex gap-3">
          <button onClick={() => addWindow("pickup")} className="text-sm font-bold text-orange">
            + Retirada
          </button>
          <button onClick={() => addWindow("delivery")} className="text-sm font-bold text-orange">
            + Entrega
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {windows.map((window) => (
          <div key={window.id} className="flex flex-col gap-2 rounded-xl bg-cream-soft p-3 sm:flex-row sm:items-center">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-coffee-soft">
              {window.type === "delivery" ? "Entrega" : "Retirada"}
            </span>
            <input
              defaultValue={window.label}
              onBlur={(e) => save(window, { label: e.target.value })}
              className="flex-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold"
              style={{ fontSize: 16 }}
            />
            <input
              type="datetime-local"
              defaultValue={toLocalInput(window.starts_at)}
              onBlur={(e) => save(window, { starts_at: new Date(e.target.value).toISOString() })}
              className="rounded-lg bg-white px-2 py-2 text-sm"
              style={{ fontSize: 16 }}
            />
            <input
              type="datetime-local"
              defaultValue={toLocalInput(window.ends_at)}
              onBlur={(e) => save(window, { ends_at: new Date(e.target.value).toISOString() })}
              className="rounded-lg bg-white px-2 py-2 text-sm"
              style={{ fontSize: 16 }}
            />
            <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
              Capacidade
              <input
                type="number"
                min={window.reserved_burgers}
                defaultValue={window.capacity_burgers}
                onBlur={(e) => save(window, { capacity_burgers: Number(e.target.value) })}
                className="w-16 rounded-lg bg-white px-2 py-1.5 text-sm"
                style={{ fontSize: 16 }}
              />
            </label>
            <span className="text-xs text-coffee-soft">Reservado: {window.reserved_burgers}</span>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-coffee-soft">
              <input
                type="checkbox"
                checked={window.active}
                onChange={(e) => save(window, { active: e.target.checked })}
              />
              Ativa
            </label>
            <button
              onClick={() => handleDelete(window)}
              className="min-h-11 shrink-0 rounded-lg bg-danger-bg px-3 py-1.5 text-xs font-bold text-danger"
            >
              Excluir
            </button>
          </div>
        ))}
        {windows.length === 0 && (
          <p className="text-sm text-coffee-soft">Nenhuma janela cadastrada ainda.</p>
        )}
      </div>
    </section>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
