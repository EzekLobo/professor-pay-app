"use client";
import { kodlandAutoSyncAvailable } from "@/lib/kodland-sync-lock";
import { watchKodlandSync } from "@/lib/kodland-sync-client";
import { classifyOperationError } from "@/lib/operation-log";
import { reportOperation } from "@/lib/operation-log-client";
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
      available: () => document.visibilityState === "visible" && navigator.onLine && kodlandAutoSyncAvailable(uid),
      context: async () => {
        const preferences = await tutorPreferencesApi.get();
        if (!owner() || !preferences.kodland_enabled) return { enabled: false, groups: [], updatedAt: {} };
        const [groups, state] = await Promise.all([kodlandApi.groups(), kodlandApi.followupState()]);
        return { enabled: true, groups: groups.items.filter(group => !group.archived).map(group => group.external_id), ...state };
      },
      credentials: restoreKodlandCredentials,
      sync: (groupId, credentials) => watchKodlandSync((report, assertActive) => kodlandApi.sync(credentials.username, credentials.password, "corrections", { correctionGroupIds: [groupId], refreshSchedule: false, onProgress: report, assertActive }), message => { if (owner()) setStatus({ phase: "syncing", message }); }),
      status: value => { if (owner()) {
        setStatus(value);
        if (value.phase === "credentials" || value.phase === "empty") reportOperation("kodland_auto_sync", "warning", { trigger: "automatic", errorCode: value.phase === "credentials" ? "credentials_missing" : "groups_missing" }, 15 * 60000);
        if (value.phase === "error") reportOperation("kodland_auto_sync", "error", { trigger: "automatic", errorCode: classifyOperationError({ message: value.message }) });
      } },
    });
    const readyAt = Date.now() + 30000;
    const tick = async () => {
      if (Date.now() < readyAt || ticking || disposed || document.visibilityState !== "visible" || !navigator.onLine) return;
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
    const first = window.setTimeout(run, 30000);
    const interval = window.setInterval(run, 30000);
    window.addEventListener("focus", run); window.addEventListener("online", run); document.addEventListener("visibilitychange", run);
    return () => { disposed = true; clearTimeout(first); clearInterval(interval); window.removeEventListener("focus", run); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", run); };
  }, [uid, demo]);
  return status;
}
