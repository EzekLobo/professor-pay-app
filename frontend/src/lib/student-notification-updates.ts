import { subscribeSyncDataChanged } from "./sync-events";
import { clearStudentNotificationSourceCache } from "./student-notification-source";

/** Data is persisted before these events. Refresh never launches another Kodland sync. */
export function subscribeNotificationDataChanges(uid: string, refresh: () => void): () => void {
  return subscribeSyncDataChanged(uid, event => {
    if (!event.domains.some(domain => domain === "activities" || domain === "attendance")) return;
    clearStudentNotificationSourceCache(); refresh();
  });
}
