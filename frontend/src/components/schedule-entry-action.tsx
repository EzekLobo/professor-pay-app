"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Video } from "lucide-react";
import { createScheduleEntryGesture, nextScheduleCallBoundary, safeScheduleCallUrl, type ScheduleCallLink } from "@/lib/schedule-call";

const systemClock = () => Date.now();
const openCall = (url: string) => { window.open(url, "_blank", "noopener,noreferrer"); };

export type ScheduleEntryActionProps = {
  children: ReactNode;
  label: string;
  onDetails(): void;
  className?: string;
  call?: ScheduleCallLink | null;
  /** Injectable for fixtures and deterministic rendering; production uses the current time. */
  clock?: () => number;
  onOpenCall?: (url: string) => void;
};

/** Details button and direct classroom link are siblings, avoiding nested interactive elements. */
export function ScheduleEntryAction({ children, label, onDetails, className, call, clock = systemClock, onOpenCall = openCall }: ScheduleEntryActionProps) {
  const [clockTick, setClockTick] = useState(0);
  const callUrl = safeScheduleCallUrl(call, clock());
  useEffect(() => {
    const now = clock();
    const boundary = nextScheduleCallBoundary(call, now);
    if (boundary === null) return;
    // Re-render only at availability/expiry, rather than polling every card.
    const timer = setTimeout(() => setClockTick(value => value + 1), Math.min(2_147_483_647, Math.max(1, boundary - now)));
    return () => clearTimeout(timer);
  }, [call, clock, clockTick]);
  const gesture = useMemo(() => createScheduleEntryGesture({
    onDetails,
    onOpenCall,
    getCallUrl: () => safeScheduleCallUrl(call, clock()),
    now: clock,
  }), [onDetails, onOpenCall, call, clock]);
  useEffect(() => () => gesture.dispose(), [gesture]);

  return <div className="schedule-entry-action" style={{ position: "relative" }}>
    <button
      type="button"
      className={className}
      aria-label={label}
      style={{ width: "100%", touchAction: "manipulation", ...(callUrl ? { paddingInlineEnd: 52 } : {}) }}
      onClick={event => gesture.activate(event.detail === 0 ? "keyboard" : "pointer")}
      onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); }}
    >{children}</button>
    {callUrl && <a
      className="schedule-call-link"
      href={callUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chamada disponível para ${label}. Abrir chamada`}
      title="Chamada disponível · Abrir chamada"
      style={{ position: "absolute", top: 4, right: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 44, minHeight: 44, borderRadius: 8, color: "var(--success, #22c55e)", touchAction: "manipulation" }}
      onClick={event => {
        event.stopPropagation();
        gesture.cancel();
        // The clock may have crossed the lesson end since rendering the icon.
        if (!safeScheduleCallUrl(call, clock())) { event.preventDefault(); onDetails(); }
      }}
      onDoubleClick={event => event.stopPropagation()}
    ><Video size={20} aria-hidden="true" /></a>}
  </div>;
}

