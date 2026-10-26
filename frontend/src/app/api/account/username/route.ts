import { NextResponse } from "next/server";
import { getAccountUsername, setAccountUsername } from "@/lib/account-username";
import { authenticatedUser, RequestAuthError } from "@/lib/server-auth";

export const runtime = "nodejs";

function failure(error: unknown) {
  if (error instanceof RequestAuthError) return NextResponse.json({ message: error.message }, { status: error.status });
  return NextResponse.json({ message: "Não foi possível atualizar o nick. Tente novamente." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    return NextResponse.json({ username: await getAccountUsername(user.uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await authenticatedUser(request);
    let body: unknown;
    try { body = await request.json(); } catch { throw new RequestAuthError(400, "Informe um nick válido."); }
    const username = body && typeof body === "object" && "username" in body ? body.username : undefined;
    return NextResponse.json({ username: await setAccountUsername(user.uid, username) });
  } catch (error) { return failure(error); }
}
