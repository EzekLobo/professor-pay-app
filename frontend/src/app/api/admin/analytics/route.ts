import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { assertAdministrator, authenticatedUser, RequestAuthError } from "@/lib/server-auth";

export const runtime = "nodejs";

type Session = {
  userId: string;
  email: string;
  name: string;
  lastSeenAt?: Timestamp;
  activeSeconds?: number;
};

type Usage = { feature?: string; views?: number };

const asDate = (value: unknown) => value instanceof Timestamp ? value.toDate() : null;
const dateKey = (value: Date) => value.toISOString().slice(0, 10);

function period(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("days") ?? "30");
  return Number.isInteger(raw) ? Math.min(90, Math.max(1, raw)) : 30;
}

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    assertAdministrator(user);
    const days = period(request);
    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - days);
    const db = getAdminDb();
    const [sessions, usage, registeredUsers] = await Promise.all([
      db.collection("admin_access_sessions")
        .where("lastSeenAt", ">=", Timestamp.fromDate(since))
        .orderBy("lastSeenAt", "desc")
        .limit(1000)
        .get(),
      db.collection("admin_usage_daily")
        .where("date", ">=", dateKey(since))
        .orderBy("date", "desc")
        .limit(3000)
        .get(),
      getAdminAuth().listUsers(1000),
    ]);

    const users = new Map<string, {
      id: string; name: string; email: string; lastSeenAt: string | null;
      activeSeconds: number; sessions: number; active: boolean;
    }>();
    sessions.docs.forEach((document) => {
      const session = document.data() as Session;
      const lastSeen = asDate(session.lastSeenAt);
      const existing = users.get(session.userId);
      const active = Boolean(lastSeen && now.getTime() - lastSeen.getTime() <= 2 * 60 * 1000);
      users.set(session.userId, {
        id: session.userId,
        name: session.name || existing?.name || "Usuário",
        email: session.email || existing?.email || "",
        lastSeenAt: !existing || (lastSeen && lastSeen.getTime() > new Date(existing.lastSeenAt ?? 0).getTime())
          ? lastSeen?.toISOString() ?? null : existing.lastSeenAt,
        activeSeconds: (existing?.activeSeconds ?? 0) + Number(session.activeSeconds ?? 0),
        sessions: (existing?.sessions ?? 0) + 1,
        active: active || Boolean(existing?.active),
      });
    });
    registeredUsers.users.forEach((user) => {
      const existing = users.get(user.uid);
      if (existing) return;
      users.set(user.uid, {
        id: user.uid,
        name: user.displayName || user.email?.split("@")[0] || "Usuário",
        email: user.email || "",
        lastSeenAt: null,
        activeSeconds: 0,
        sessions: 0,
        active: false,
      });
    });

    const features = new Map<string, number>();
    usage.docs.forEach((document) => {
      const item = document.data() as Usage;
      const feature = item.feature ?? "Outra funcionalidade";
      features.set(feature, (features.get(feature) ?? 0) + Number(item.views ?? 0));
    });
    const userList = [...users.values()].sort((a, b) =>
      new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime(),
    );
    const totalActiveSeconds = userList.reduce((total, item) => total + item.activeSeconds, 0);

    return NextResponse.json({
      generatedAt: now.toISOString(),
      periodDays: days,
      summary: {
        users: userList.length,
        activeNow: userList.filter((item) => item.active).length,
        activeSeconds: totalActiveSeconds,
        pageViews: [...features.values()].reduce((total, value) => total + value, 0),
      },
      users: userList,
      features: [...features.entries()]
        .map(([feature, views]) => ({ feature, views }))
        .sort((a, b) => b.views - a.views),
    });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Não foi possível carregar o painel administrativo." }, { status: 500 });
  }
}
