export type ScheduleCallLink = {
  url: string | null | undefined;
  /** Identity saved with the URL and identity of the card currently being rendered. */
  occurrenceKey: string | null | undefined;
  expectedOccurrenceKey: string;
  startAt: number;
  endAt: number;
};

const classroomPath = /^\/(?:(?:en|ru|es|id|it|tr|pl|pt|ar)\/)?class-room\/?$/;
const MINUTE = 60_000;

/** Only the classroom route observed in the official Kodland teacher client is accepted. */
export function safeScheduleCallUrl(call: ScheduleCallLink | null | undefined, now: number): string | null {
  if (!call?.url || !call.expectedOccurrenceKey || call.occurrenceKey !== call.expectedOccurrenceKey) return null;
  if (![now, call.startAt, call.endAt].every(Number.isFinite) || call.endAt <= call.startAt) return null;
  if (now < call.startAt - 15 * MINUTE || now >= call.endAt) return null;
  try {
    const url = new URL(call.url);
    if (call.url !== call.url.trim() || url.origin !== "https://learn.kodland.org" || url.username || url.password || url.hash || !classroomPath.test(url.pathname)) return null;
    const sessions = url.searchParams.getAll("sessionId");
    if (sessions.length !== 1 || !/^[A-Za-z0-9_-]{1,160}$/.test(sessions[0])) return null;
    if ([...url.searchParams.keys()].some(key => key !== "sessionId")) return null;
    return call.url;
  } catch { return null; }
}

/** The next point at which an already-known call can change its visible availability. */
export function nextScheduleCallBoundary(call: ScheduleCallLink | null | undefined, now: number): number | null {
  if (!call || !Number.isFinite(now)) return null;
  const availableAt = call.startAt - 15 * MINUTE;
  if (!safeScheduleCallUrl(call, Math.max(now, availableAt))) return null;
  return now < availableAt ? availableAt : call.endAt;
}

export type ScheduleEntryGestureOptions = {
  onDetails(): void;
  onOpenCall(url: string): void;
  /** Revalidate on the second click, including expiry or rescheduling between clicks. */
  getCallUrl(): string | null;
  now?: () => number;
  delayMs?: number;
};

/** Uses click events only; the browser's subsequent dblclick must not invoke a second action. */
export function createScheduleEntryGesture(options: ScheduleEntryGestureOptions) {
  const now = options.now ?? Date.now;
  const delay = options.delayMs ?? 300;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstClickAt: number | null = null;
  let ignoreUntil = -Infinity;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    firstClickAt = null;
  };
  return {
    activate(source: "pointer" | "keyboard" = "pointer") {
      if (source === "keyboard") { cancel(); options.onDetails(); return; }
      const at = now();
      if (at < ignoreUntil) return;
      const callUrl = options.getCallUrl();
      if (firstClickAt !== null && at - firstClickAt <= delay) {
        cancel();
        ignoreUntil = at + delay;
        if (callUrl) options.onOpenCall(callUrl);
        else options.onDetails();
        return;
      }
      cancel();
      if (!callUrl) { options.onDetails(); return; }
      firstClickAt = at;
      timer = setTimeout(() => { cancel(); options.onDetails(); }, delay);
    },
    cancel,
    dispose: cancel,
  };
}

