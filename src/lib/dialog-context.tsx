"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Dialog } from "@/components/Dialog";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface AlertOptions {
  title: string;
  message?: string;
  buttonLabel?: string;
  tone?: "default" | "success" | "danger";
}

type DialogState =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "alert"; options: AlertOptions; resolve: () => void }
  | null;

interface DialogContextValue {
  confirmDialog: (options: ConfirmOptions) => Promise<boolean>;
  alertDialog: (options: AlertOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>(null);

  const confirmDialog = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ kind: "confirm", options, resolve });
    });
  }, []);

  const alertDialog = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setState({ kind: "alert", options, resolve });
    });
  }, []);

  function handleResolve(value: boolean) {
    if (!state) return;
    if (state.kind === "confirm") state.resolve(value);
    else state.resolve();
    setState(null);
  }

  return (
    <DialogContext.Provider value={{ confirmDialog, alertDialog }}>
      {children}
      <Dialog state={state} onResolve={handleResolve} />
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}
