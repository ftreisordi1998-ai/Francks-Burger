"use client";

import { useEffect, useRef, useState } from "react";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.5; // px/ms

export function BottomSheet({
  open,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Sticky footer pinned to the bottom of the sheet, always visible regardless of scroll. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startY: number; startT: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  if (!open) return null;

  function handlePointerDown(e: React.PointerEvent) {
    dragState.current = { startY: e.clientY, startT: performance.now() };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const delta = e.clientY - dragState.current.startY;
    setDragY(Math.max(0, delta));
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragState.current) return;
    const delta = e.clientY - dragState.current.startY;
    const elapsed = Math.max(1, performance.now() - dragState.current.startT);
    const velocity = delta / elapsed;
    dragState.current = null;
    setDragging(false);
    if (delta > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
      onClose();
    } else {
      setDragY(0);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="animate-fade-in absolute inset-0 bg-coffee/45"
        style={{ opacity: dragY ? Math.max(0.2, 1 - dragY / 400) : undefined }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="animate-sheet-up relative flex max-h-[92vh] w-full flex-col rounded-t-[28px] bg-cream shadow-2xl sm:max-w-lg sm:rounded-[28px]"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center bg-cream pb-1 pt-2.5 touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="h-1.5 w-10 rounded-full bg-coffee/15" />
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${footer ? "" : "pb-[env(safe-area-inset-bottom)]"}`}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-coffee/10 bg-cream px-5 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
