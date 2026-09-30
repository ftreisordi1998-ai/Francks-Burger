import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/Badge";
import { formatDateShort } from "@/lib/format";
import { NewEditionButton } from "@/components/admin/NewEditionButton";
import type { Edition } from "@/lib/types";

export const dynamic = "force-dynamic";

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

export default async function AdminEditionsPage() {
  const supabase = await createClient();
  const { data: editions } = await supabase
    .from("editions")
    .select("*")
    .order("prep_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-coffee">Edições</h1>
        <NewEditionButton />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {(editions ?? []).map((edition: Edition) => (
          <Link
            key={edition.id}
            href={`/admin/edicoes/${edition.id}`}
            className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 hover:bg-cream-soft/60"
          >
            <div>
              <p className="font-bold text-coffee">
                {edition.title} {edition.is_demo && <span className="text-xs font-medium text-orange">(demo)</span>}
              </p>
              <p className="text-sm text-coffee-soft">Preparo em {formatDateShort(edition.prep_date)}</p>
            </div>
            <Badge tone={STATUS_TONE[edition.status]}>{STATUS_LABEL[edition.status]}</Badge>
          </Link>
        ))}
        {(editions ?? []).length === 0 && (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-coffee-soft">
            Nenhuma edição criada ainda.
          </p>
        )}
      </div>
    </div>
  );
}
