import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { validateOperationLog, type OperationLogInput, type OperationLogRow } from "./operation-log";
export class OperationLogRateLimitError extends Error {}
/** Server-only collection: clients cannot read or directly write these documents. */
export async function saveOperationLogs(uid: string, events: OperationLogInput[], now = new Date()) {
  const db = getAdminDb();
  const quota = db.collection("operation_log_limits").doc(uid);
  const references = events.map(event => db.collection("operation_logs").doc(`${uid}_${event.id}`));
  await db.runTransaction(async tx => {
    const [limit, ...snapshots] = await Promise.all([tx.get(quota), ...references.map(reference => tx.get(reference))]);
    const bucket = Math.floor(now.getTime() / 60000);
    const previous = limit.data();
    const used = previous?.bucket === bucket ? Number(previous.count) || 0 : 0;
    if (used + events.length > 120) throw new OperationLogRateLimitError();
    tx.set(quota, { bucket, count: used + events.length, expiresAt: Timestamp.fromMillis(now.getTime() + 86400000) });
    events.forEach((event, index) => {
      const old = snapshots[index].data();
      // A delayed start/duplicate must not undo a terminal result.
      if (old && (old.operation !== event.operation || old.status !== "running")) return;
      tx.set(references[index], {
        ...event, userId: uid, origin: "client",
        receivedAt: old?.receivedAt ?? Timestamp.fromDate(now), updatedAt: Timestamp.fromDate(now),
        expiresAt: Timestamp.fromMillis(now.getTime() + 30 * 86400000),
      });
    });
  });
}
export async function recentOperationLogs(days: number, now = new Date()): Promise<{ logs: OperationLogRow[]; truncated: boolean }> {
  const result = await getAdminDb().collection("operation_logs")
    .where("updatedAt", ">=", Timestamp.fromMillis(now.getTime() - days * 86400000))
    .orderBy("updatedAt", "desc").limit(201).get();
  const logs: OperationLogRow[] = result.docs.slice(0, 200).flatMap(document => {
    const value = document.data();
    const iso = (input: unknown) => input instanceof Timestamp ? input.toDate().toISOString() : "";
    try {
      const technical = Object.fromEntries(["id", "operation", "status", "scope", "trigger", "errorCode", "reference", "pathname", "durationMs", "counts", "version", "errorType"].filter(key => value[key] !== undefined).map(key => [key, value[key]]));
      return [{ ...validateOperationLog(technical), userId: String(value.userId), origin: "client" as const, receivedAt: iso(value.receivedAt), updatedAt: iso(value.updatedAt) }];
    } catch { return []; }
  });
  return { logs, truncated: result.docs.length > 200 };
}
