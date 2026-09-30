"use client";

export function QtyStepper({
  qty,
  max,
  onChange,
}: {
  qty: number;
  max: number;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-full bg-cream-soft p-1">
      <button
        type="button"
        aria-label="Diminuir quantidade"
        disabled={qty <= 0}
        onClick={() => onChange(Math.max(0, qty - 1))}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg font-bold text-coffee shadow-sm disabled:opacity-30"
      >
        –
      </button>
      <span className="w-6 text-center text-base font-bold tabular-nums">{qty}</span>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        disabled={qty >= max}
        onClick={() => onChange(Math.min(max, qty + 1))}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-orange text-lg font-bold text-white shadow-sm disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
