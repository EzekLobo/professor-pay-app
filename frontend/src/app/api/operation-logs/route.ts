import { NextResponse } from "next/server";
import { authenticatedUser, RequestAuthError } from "@/lib/server-auth";
import { validateOperationLog } from "@/lib/operation-log";
import { OperationLogRateLimitError, saveOperationLogs } from "@/lib/operation-log-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 24576) return NextResponse.json({ message: "Lote muito grande." }, { status: 413 });
    let events;
    try {
      const value = JSON.parse(text);
      if (!value || Object.keys(value).length !== 1 || !Array.isArray(value.events) || !value.events.length || value.events.length > 20) throw new Error();
      events = value.events.map(validateOperationLog);
      if (new Set(events.map((event: { id: string }) => event.id)).size !== events.length) throw new Error();
    } catch { return NextResponse.json({ message: "Registros inválidos." }, { status: 400 }); }
    await saveOperationLogs(user.uid, events);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (reason) {
    if (reason instanceof RequestAuthError) return NextResponse.json({ message: reason.message }, { status: reason.status, headers: { "cache-control": "no-store" } });
    if (reason instanceof OperationLogRateLimitError) return NextResponse.json({ message: "Limite temporário de registros." }, { status: 429, headers: { "retry-after": "60" } });
    return NextResponse.json({ message: "Não foi possível registrar o diagnóstico." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
