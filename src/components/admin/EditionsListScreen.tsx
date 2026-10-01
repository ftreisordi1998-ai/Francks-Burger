"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { useDialog } from "@/lib/dialog-context";
import { createClient } from "@/lib/supabase/client";
import { formatDateShort, formatDateTime } from "@/lib/format";
import { NewEditionButton } from "./NewEditionButton";
import { ToggleSwitch } from "./ToggleSwitch";
import type { Edition } from "@/lib/types";

const STATUS_LABEL: Record<Edition["status"], string> = {
  draft: "Rascunho",
  open: "Aberta",
  closed: "Encerrada",
};

const STATUS_TONE: Record<Edition["status"], "info" | "success" | "warning"> = {
  draft: "info",
  open: "success",
  closed: "warning",
};

export function EditionsListScreen({ initialEditions }: { initialEditions: Edition[] }) {
  const [editions, setEditions] = useState(initialEditions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { confirmDialog, alertDialog } = useDialog();
  const router = useRouter();
  const channelSuffix = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function start() {
      // O socket do Realtime não herda a sessão dos cookies automaticamente —
      // sem isto, updates na tabela `editions` são bloqueados pela RLS.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`admin-editions-list-${channelSuffix}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "editions" },
          (payload) => {
            if (payload.eventType === "DELETE") {
              setEditions((prev) => prev.filter((ed) => ed.id !== (payload.old as Edition).id));
              return;
            }
            setEditions((prev) => {
              const updated = payload.new as Edition;
              if (prev.some((ed) => ed.id === updated.id)) {
                return prev.map((ed) => (ed.id === updated.id ? { ...ed, ...updated } : ed));
              }
              return [updated, ...prev];
            });
          }
        )
        .subscribe();
    }

    start();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      authSubscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function handleToggleOpen(edition: Edition, nextOpen: boolean) {
    setTogglingId(edition.id);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("editions")
      .update({ status: nextOpen ? "open" : "closed" })
      .eq("id", edition.id)
      .select("*")
      .single();
    setTogglingId(null);
    if (!error && data) {
      setEditions((prev) => prev.map((ed) => (ed.id === edition.id ? (data as Edition) : ed)));
    }
  }

  async function handleDelete(edition: Edition, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirmDialog({
      title: `Excluir "${edition.title}"?`,
      message:
        "Isso apaga a edição, seus sabores, janelas e bairros para sempre. Não pode ser desfeito.",
      confirmLabel: "Excluir para sempre",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(edition.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_edition", { p_edition_id: edition.id });
    setBusyId(null);

    if (error) {
      if (error.message.includes("HAS_ORDERS")) {
        await alertDialog({
          title: "Não é possível excluir",
          message:
            "Esta edição já tem pedidos registrados. Para preservar o histórico, edições com pedidos não podem ser apagadas — encerre-a em vez disso.",
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
    setEditions((prev) => prev.filter((ed) => ed.id !== edition.id));
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-coffee">Edições</h1>
        <NewEditionButton />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {editions.map((edition) => (
          <Link
            key={edition.id}
            href={`/admin/edicoes/${edition.id}`}
            className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-3.5 hover:bg-cream-soft/60 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate font-bold text-coffee">
                {edition.title}{" "}
                {edition.is_demo && <span className="text-xs font-medium text-orange">(demo)</span>}
              </p>
              <p className="text-sm text-coffee-soft">Preparo em {formatDateShort(edition.prep_date)}</p>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
              <div
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex items-center gap-2"
                title={edition.status === "open" ? "Loja aberta" : "Loja fechada"}
              >
                <ToggleSwitch
                  checked={edition.status === "open"}
                  disabled={togglingId === edition.id}
                  onChange={(next) => handleToggleOpen(edition, next)}
                />
                <Badge tone={STATUS_TONE[edition.status]}>{STATUS_LABEL[edition.status]}</Badge>
                {edition.status === "open" &&
                  edition.opens_at &&
                  new Date(edition.opens_at) > new Date() && (
                    <Badge tone="warning">Agendada p/ {formatDateTime(edition.opens_at)}</Badge>
                  )}
              </div>
              <button
                onClick={(e) => handleDelete(edition, e)}
                disabled={busyId === edition.id}
                className="min-h-11 shrink-0 rounded-lg bg-danger-bg px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50"
              >
                {busyId === edition.id ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          </Link>
        ))}
        {editions.length === 0 && (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-coffee-soft">
            Nenhuma edição criada ainda.
          </p>
        )}
      </div>
    </div>
  );
}
