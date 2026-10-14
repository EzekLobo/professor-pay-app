import { NextRequest } from "next/server";

export const runtime = "nodejs";
const response = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!idToken || !apiKey) return response({ message: "Faça login no NexusClass para continuar." }, 401);
  try {
    const account = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }), cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!account.ok || !(await account.json()).users?.[0]?.localId) {
      return response({ message: "Sua sessão expirou. Entre novamente no NexusClass." }, 401);
    }
    const body = await request.json();
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!username || !password) return response({ message: "Salve as credenciais em Dados e backup." }, 400);
    const login = await fetch("https://sso.production.kodland.org/login", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password }), cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!login.ok) {
      return response({ message: login.status === 401 || login.status === 403
        ? "A Kodland recusou as credenciais salvas. Atualize-as em Dados e backup."
        : "Não foi possível entrar na Kodland. Tente novamente." }, login.status === 401 || login.status === 403 ? 403 : 502);
    }
    const tokens = await login.json();
    if (typeof tokens.access_token !== "string" || !tokens.access_token ||
        typeof tokens.refresh_token !== "string" || !tokens.refresh_token) {
      return response({ message: "A Kodland não retornou uma sessão completa para a atividade." }, 502);
    }
    // Credentials and provider tokens are transient: never log or persist them.
    return response({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
  } catch {
    return response({ message: "Não foi possível entrar automaticamente na Kodland. Tente novamente." }, 502);
  }
}
