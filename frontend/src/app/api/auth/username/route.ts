import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { validLoginUsername } from "@/lib/login-username";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: unknown };
    const username = validLoginUsername(typeof body.username === "string" ? body.username : "");
    if (!username) return NextResponse.json({ message: "Usuário ou senha inválidos." }, { status: 401 });
    const snapshot = await getAdminDb().collection("login_usernames").doc(username).get();
    const email = snapshot.exists ? String(snapshot.data()?.email ?? "") : "";
    if (!email) return NextResponse.json({ message: "Usuário ou senha inválidos." }, { status: 401 });
    return NextResponse.json({ email });
  } catch {
    return NextResponse.json({ message: "Não foi possível entrar agora." }, { status: 500 });
  }
}
