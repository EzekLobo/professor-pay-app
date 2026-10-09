"use client";

import { useEffect, useRef } from "react";
import type { User } from "@/lib/api";
import {
  endAccessSession,
  heartbeatAccessSession,
  startAccessSession,
  trackPageView,
} from "@/lib/audit-client";

const storageKey = "nexusclass.access-session.v1";
const idleWindowMs = 2 * 60 * 1000;
const heartbeatMs = 60 * 1000;

type StoredSession = { id: string; userId: string; lastSeenAt: number };

function loadSession(userId: string): StoredSession {
  const raw = window.localStorage.getItem(storageKey);
  try {
    const saved = raw ? JSON.parse(raw) as StoredSession : null;
    if (saved?.id && saved.userId === userId && Date.now() - saved.lastSeenAt < idleWindowMs) {
      return saved;
    }
  } catch {
    // A session is optional; discard malformed browser storage.
  }
  return { id: crypto.randomUUID(), userId, lastSeenAt: Date.now() };
}

function saveSession(session: StoredSession) {
  window.localStorage.setItem(storageKey, JSON.stringify({ ...session, lastSeenAt: Date.now() }));
}

export function endStoredAccessSession() {
  if (typeof window === "undefined") return;
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as StoredSession | null;
    if (saved?.id) void endAccessSession(saved.id);
    window.localStorage.removeItem(storageKey);
  } catch {
    window.localStorage.removeItem(storageKey);
  }
}

export function AccessTelemetry({ user, pathname }: { user: User; pathname: string }) {
  const sessionRef = useRef<StoredSession | null>(null);

  useEffect(() => {
    const session = loadSession(user.id);
    sessionRef.current = session;
    saveSession(session);
    void startAccessSession(session.id).catch(() => undefined);

    const pulse = () => {
      if (document.visibilityState === "hidden" || !sessionRef.current) return;
      saveSession(sessionRef.current);
      void heartbeatAccessSession(sessionRef.current.id).catch(() => undefined);
    };
    const interval = window.setInterval(pulse, heartbeatMs);
    document.addEventListener("visibilitychange", pulse);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", pulse);
    };
  }, [user.id]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    saveSession(session);
    void trackPageView(session.id, pathname).catch(() => undefined);
  }, [pathname]);

  return null;
}
