"use client";

import { useEffect } from "react";

/**
 * Mimics iOS's edge-swipe-to-go-back gesture: dragging right from near the
 * left edge of the screen triggers `onBack`. Needed because installed PWAs
 * (standalone mode) have no browser chrome to provide this natively.
 */
export function useSwipeBack(onBack: () => void, edgeWidth = 24, threshold = 60) {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (t.clientX <= edgeWidth) {
        startX = t.clientX;
        startY = t.clientY;
        tracking = true;
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx > threshold && dy < 60) onBack();
    }

    function onTouchCancel() {
      tracking = false;
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [onBack, edgeWidth, threshold]);
}
