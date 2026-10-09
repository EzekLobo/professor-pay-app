import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { assertAdministrator, authenticatedUser, RequestAuthError } from "@/lib/server-auth";

export const runtime = "nodejs";

type CreateUserInput = { name?: unknown; email?: unknown; password?: unknown };

function validInput(input: CreateUserInput) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (name.length < 2 || name.length > 100) throw new RequestAuthError(400, "Informe um nome entre 2 e 100 caracteres.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestAuthError(400, "Informe um e-mail válido.");
  if (password.length < 10) throw new RequestAuthError(400, "A senha inicial precisa ter pelo menos 10 caracteres.");
  return { name, email, password };
}

export async function POST(request: Request) {
  try {
    const administrator = await authenticatedUser(request);
    assertAdministrator(administrator);
    const input = validInput(await request.json() as CreateUserInput);
    const user = await getAdminAuth().createUser({
      email: input.email,
      password: input.password,
      displayName: input.name,
      disabled: false,
    });
    return NextResponse.json({ user: { id: user.uid, name: user.displayName, email: user.email } }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "auth/email-already-exists") {
      return NextResponse.json({ message: "Já existe uma conta com este e-mail." }, { status: 409 });
    }
    return NextResponse.json({ message: "Não foi possível cadastrar o usuário." }, { status: 500 });
  }
}
