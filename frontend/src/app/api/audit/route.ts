import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { authenticatedUser, RequestAuthError } from "@/lib/server-auth";

export const runtime = "nodejs";

const paths: Record<string, string> = {
  "/dashboard": "Resumo",
  "/payments": "Pagamentos",
  "/classes": "Turmas",
  "/lessons": "Aulas",
  "/corrections": "Correções",
  "/data": "Dados e backup",
  "/admin": "Administração",
};

type AuditAction = "start" | "heartbeat" | "end" | "page_view";
type AuditRequest = { action?: AuditAction; sessionId?: string; pathname?: string };

const validSessionId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{16,128}$/.test(value);

const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
}).format(date);

async function refreshSession(
  sessionId: string,
  user: { uid: string; email?: string; name?: string },
  ending = false,
) {
  const db = getAdminDb();
  const reference = db.collection("admin_access_sessions").doc(`${user.uid}_${sessionId}`);
  const now = new Date();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data();
    const previousSeen = previous?.lastSeenAt instanceof Timestamp ? previous.lastSeenAt.toDate() : now;
    const activeSeconds = Math.max(0, Math.min(90, Math.floor((now.getTime() - previousSeen.getTime()) / 1000)));
    transaction.set(reference, {
      userId: user.uid,
      email: user.email ?? "",
      name: user.name ?? user.email?.split("@")[0] ?? "Usuário",
      startedAt: previous?.startedAt ?? Timestamp.fromDate(now),
      lastSeenAt: Timestamp.fromDate(now),
      activeSeconds: Number(previous?.activeSeconds ?? 0) + activeSeconds,
      status: ending ? "ended" : "active",
      ...(ending ? { endedAt: Timestamp.fromDate(now) } : {}),
    }, { merge: true });
  });

  return now;
}

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const body = await request.json() as AuditRequest;
    if (!validSessionId(body.sessionId) || !body.action) {
      return NextResponse.json({ message: "Solicitação de auditoria inválida." }, { status: 400 });
    }

    if (body.action === "start" || body.action === "heartbeat" || body.action === "end") {
      await refreshSession(body.sessionId, user, body.action === "end");
      return NextResponse.json({ ok: true });
    }

    if (body.action !== "page_view" || !body.pathname || !paths[body.pathname]) {
      return NextResponse.json({ message: "Evento de auditoria inválido." }, { status: 400 });
    }

    const now = await refreshSession(body.sessionId, user);
    const feature = paths[body.pathname];
    const usageId = `${dayKey(now)}_${user.uid}_${body.pathname.slice(1)}`;
    await getAdminDb().collection("admin_usage_daily").doc(usageId).set({
      date: dayKey(now),
      userId: user.uid,
      feature,
      pathname: body.pathname,
      views: FieldValue.increment(1),
      lastSeenAt: Timestamp.fromDate(now),
    }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Não foi possível registrar o acesso." }, { status: 500 });
  }
}
