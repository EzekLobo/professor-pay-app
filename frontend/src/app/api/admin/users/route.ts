import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import {
  assertAdministrator,
  authenticatedUser,
  isOwnerAdministrator,
  RequestAuthError,
} from "@/lib/server-auth";

export const runtime = "nodejs";

type CreateUserInput = { name?: unknown; email?: unknown; password?: unknown };
type DeleteUserInput = { userId?: unknown };

function validInput(input: CreateUserInput) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (name.length < 2 || name.length > 100) throw new RequestAuthError(400, "Informe um nome entre 2 e 100 caracteres.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestAuthError(400, "Informe um e-mail válido.");
  if (password.length < 10) throw new RequestAuthError(400, "A senha inicial precisa ter pelo menos 10 caracteres.");
  return { name, email, password };
}

function validUserId(input: DeleteUserInput) {
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!userId) throw new RequestAuthError(400, "Selecione um usuário para remover.");
  return userId;
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

export async function DELETE(request: Request) {
  try {
    const administrator = await authenticatedUser(request);
    assertAdministrator(administrator);
    const userId = validUserId(await request.json() as DeleteUserInput);
    if (userId === administrator.uid) {
      throw new RequestAuthError(400, "Você não pode remover a sua própria conta administrativa.");
    }

    const auth = getAdminAuth();
    const target = await auth.getUser(userId);
    if (isOwnerAdministrator(target.email)) {
      throw new RequestAuthError(403, "A conta administradora principal não pode ser removida.");
    }

    await auth.deleteUser(userId);
    return NextResponse.json({ user: { id: target.uid, name: target.displayName, email: target.email } });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "auth/user-not-found") {
      return NextResponse.json({ message: "Este usuário já não existe." }, { status: 404 });
    }
    return NextResponse.json({ message: "Não foi possível remover o usuário." }, { status: 500 });
  }
}
