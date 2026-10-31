import { NextResponse } from "next/server";
import { assertAdministrator, authenticatedUser, RequestAuthError } from "@/lib/server-auth";
import { recentOperationLogs } from "@/lib/operation-log-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request); assertAdministrator(user);
    const raw = Number(new URL(request.url).searchParams.get("days") ?? 7);
    const days = [1, 7, 30].includes(raw) ? raw : 7;
    return NextResponse.json({ ...await recentOperationLogs(days), days, generatedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch (reason) {
    if (reason instanceof RequestAuthError) return NextResponse.json({ message: reason.message }, { status: reason.status, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ message: "Não foi possível consultar os logs. Verifique a configuração Firebase do servidor." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
