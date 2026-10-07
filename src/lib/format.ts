const TZ = "America/Sao_Paulo";
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Datas "puras" (ex.: prep_date, tipo `date` no Postgres, sem hora) não têm fuso —
// `new Date("2026-10-09")` vira meia-noite UTC, que ao converter pro horário de
// Brasília (UTC-3) cai no dia anterior. Pra essas, ancoramos em UTC e formatamos
// em UTC também, sem nunca passar pelo fuso de Brasília.
function resolveDate(value: string | Date): { date: Date; timeZone: string } {
  if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return { date: new Date(Date.UTC(y, m - 1, d)), timeZone: "UTC" };
  }
  return { date: typeof value === "string" ? new Date(value) : value, timeZone: TZ };
}

export function formatDate(value: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const { date, timeZone } = resolveDate(value);
  return date.toLocaleDateString("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "long",
    ...opts,
  });
}

export function formatDateShort(value: string | Date): string {
  const { date, timeZone } = resolveDate(value);
  return date.toLocaleDateString("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatWeekday(value: string | Date): string {
  const { date, timeZone } = resolveDate(value);
  return date.toLocaleDateString("pt-BR", { timeZone, weekday: "long" });
}

export function isPast(value: string | Date): boolean {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.getTime() < Date.now();
}
