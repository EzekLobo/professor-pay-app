"use client";
import { useEffect, useState } from "react";
import { kodlandApi, tutorPreferencesApi } from "@/lib/api";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import { getFirebaseAuth } from "@/lib/firebase";
import { createKodlandAutoSync, type AutoSyncStatus } from "@/lib/kodland-auto-sync";

/** Runs only for authenticated accounts, while a visible tab has connectivity. */
export function useKodlandAutoSync(uid: string, demo: boolean) {
  const [status, setStatus] = useState<AutoSyncStatus>({ phase: "idle" });
  useEffect(() => {
    if (demo) return;
    let disposed = false;
    let ticking = false;
    const owner = () => !disposed && getFirebaseAuth().currentUser?.uid === uid;
    const controller = createKodlandAutoSync({
      owner,
      available: () => document.visibilityState === "visible" && navigator.onLine,
      context: async () => {
        const preferences = await tutorPreferencesApi.get();
        if (!owner() || !preferences.kodland_enabled) return { enabled: false, groups: [], updatedAt: {} };
        const [groups, state] = await Promise.all([kodlandApi.groups(), kodlandApi.followupState()]);
        return { enabled: true, groups: groups.items.filter(group => !group.archived).map(group => group.external_id), ...state };
      },
      credentials: restoreKodlandCredentials,
      sync: (groupId, credentials) => kodlandApi.sync(credentials.username, credentials.password, "corrections", { correctionGroupIds: [groupId], refreshSchedule: false }),
      status: value => { if (owner()) setStatus(value); },
    });
    const tick = async () => {
      if (ticking || disposed || document.visibilityState !== "visible" || !navigator.onLine) return;
      ticking = true;
      const run = async () => {
        if (disposed) return;
        await controller.tick({ active: document.visibilityState === "visible", online: navigator.onLine, following: window.location.pathname === "/corrections" });
      };
      try {
        if (navigator.locks) await navigator.locks.request(`nexusclass:kodland-auto:${uid}`, { ifAvailable: true }, lock => lock ? run() : Promise.resolve());
        else await run();
      } finally { ticking = false; }
    };
    const run = () => { void tick().catch(() => undefined); };
    const first = window.setTimeout(run, 1500);
    const interval = window.setInterval(run, 30000);
    window.addEventListener("focus", run); window.addEventListener("online", run); document.addEventListener("visibilitychange", run);
    return () => { disposed = true; clearTimeout(first); clearInterval(interval); window.removeEventListener("focus", run); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", run); };
  }, [uid, demo]);
  return status;
}
