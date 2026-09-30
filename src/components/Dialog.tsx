"use client";

import { useEffect, useRef } from "react";
import type { AlertOptions, ConfirmOptions } from "@/lib/dialog-context";

type DialogState =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "alert"; options: AlertOptions; resolve: () => void }
  | null;

export function Dialog({
  state,
  onResolve,
}: {
  state: DialogState;
  onResolve: (value: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!state) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = requestAnimationFrame(() => confirmRef.current?.focus());
    return () => {
      document.body.style.overflow = original;
      cancelAnimationFrame(id);
    };
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onResolve(false);
      if (e.key === "Enter") onResolve(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, onResolve]);

  if (!state) return null;

  const isConfirm = state.kind === "confirm";
  const destructive = isConfirm && state.options.destructive;
  const tone = !isConfirm ? state.options.tone ?? "default" : undefined;

  const title = state.options.title;
  const message = state.options.message;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
      <div
        className="animate-fade-in absolute inset-0 bg-coffee/40 backdrop-blur-sm"
        onClick={() => onResolve(false)}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="animate-dialog-pop relative w-full max-w-[320px] overflow-hidden rounded-[22px] bg-cream shadow-2xl"
      >
        <div className="flex flex-col items-center gap-2 px-6 pb-5 pt-7 text-center">
          <DialogIcon destructive={!!destructive} tone={tone} />
          <h2 id="dialog-title" className="mt-1 text-[17px] font-extrabold leading-tight text-coffee">
            {title}
          </h2>
          {message && (
            <p className="text-[14px] leading-relaxed text-coffee-soft">{message}</p>
          )}
        </div>

        {isConfirm ? (
          <div className="grid grid-cols-2 border-t border-coffee/10">
            <button
              onClick={() => onResolve(false)}
              className="border-r border-coffee/10 py-3.5 text-[15px] font-semibold text-coffee-soft transition active:bg-coffee/5"
            >
              {state.options.cancelLabel ?? "Cancelar"}
            </button>
            <button
              ref={confirmRef}
              onClick={() => onResolve(true)}
              className={`py-3.5 text-[15px] font-bold transition active:bg-coffee/5 ${
                destructive ? "text-danger" : "text-orange"
              }`}
            >
              {state.options.confirmLabel ?? "Confirmar"}
            </button>
          </div>
        ) : (
          <div className="border-t border-coffee/10">
            <button
              ref={confirmRef}
              onClick={() => onResolve(true)}
              className="w-full py-3.5 text-[15px] font-bold text-orange transition active:bg-coffee/5"
            >
              {state.options.buttonLabel ?? "OK"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DialogIcon({
  destructive,
  tone,
}: {
  destructive: boolean;
  tone?: "default" | "success" | "danger";
}) {
  if (destructive || tone === "danger") {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2L7 7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 11v6M14 11v6" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (tone === "success") {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-soft text-orange">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" strokeLinecap="round" />
        <circle cx="12" cy="16" r="0.5" fill="currentColor" />
      </svg>
    </span>
  );
}
