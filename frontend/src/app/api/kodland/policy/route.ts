import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { assertAdministrator, authenticatedUser, RequestAuthError } from "@/lib/server-auth";
import type { KodlandStorage } from "@/lib/kodland-storage-policy";
export const runtime = "nodejs";
let cached: { storage: KodlandStorage; until: number } | null = null;
const reference = () => getAdminDb().collection("app_settings").doc("kodland_sync");
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
const failure = (error: unknown) => error instanceof RequestAuthError ? reply({ message: error.message }, error.status) : reply({ message: "Não foi possível acessar a configuração de sincronização." }, 503);
export async function GET(request: Request) {
  try {
    await authenticatedUser(request);
    if (cached && cached.until > Date.now()) return reply({ storage: cached.storage });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snapshot = await Promise.race([reference().get(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("policy_timeout")), 2000); })]);
      const storage: KodlandStorage = snapshot.data()?.storage === "firebase" ? "firebase" : "browser";
      cached = { storage, until: Date.now() + 60000 };
      return reply({ storage });
    } finally { clearTimeout(timer); }
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    const administrator = await authenticatedUser(request);
    assertAdministrator(administrator);
    const body = await request.json();
    if (!["browser", "firebase"].includes(body?.storage)) return reply({ message: "Selecione Navegador ou Firebase." }, 400);
    await reference().set({ storage: body.storage, updated_by: administrator.uid, updated_at: new Date().toISOString() });
    cached = { storage: body.storage, until: Date.now() + 60000 };
    return reply({ storage: body.storage });
  } catch (error) { return failure(error); }
}
