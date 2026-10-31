"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/** Anchored in viewport coordinates so header filters/scroll cannot clip the list. */
export function HeaderDropdown({ open, id, label, trigger, onClose, children, className = "" }: {
  open: boolean; id: string; label: string; trigger: RefObject<HTMLButtonElement | null>; onClose: () => void; children: ReactNode; className?: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewport = window.visualViewport;
      const width = Math.min(390, (viewport?.width ?? innerWidth) - 24);
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const bottom = topEdge + (viewport?.height ?? innerHeight);
      const top = Math.max(topEdge + 12, Math.min(anchor.bottom + 8, bottom - 140));
      const left = Math.max(leftEdge + 12, Math.min(anchor.right - width, leftEdge + (viewport?.width ?? innerWidth) - width - 12));
      setPosition({ position: "fixed", top, left, right: "auto", width, maxHeight: Math.min(580, bottom - top - 12), zIndex: 1100 });
    };
    const frame = requestAnimationFrame(measure);
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) closeRef.current();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closeRef.current(); trigger.current?.focus(); } };
    const scroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) measure(); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    window.addEventListener("resize", measure); window.addEventListener("scroll", scroll, true);
    window.visualViewport?.addEventListener("resize", measure); window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", measure); window.removeEventListener("scroll", scroll, true);
      window.visualViewport?.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [open, trigger]);
  if (!open || !position || typeof document === "undefined") return null;
  return createPortal(<section ref={panel} id={id} role="region" aria-label={label} className={`notifications-dropdown ${className}`} style={position}>{children}</section>, document.body);
}
