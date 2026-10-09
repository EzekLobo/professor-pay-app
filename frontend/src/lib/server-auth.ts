import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "@/lib/firebase-admin";

export class RequestAuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function authenticatedUser(request: Request): Promise<DecodedIdToken> {
  const value = request.headers.get("authorization") ?? "";
  const token = value.startsWith("Bearer ") ? value.slice(7) : "";
  if (!token) throw new RequestAuthError(401, "Faça login para continuar.");

  try {
    return await getAdminAuth().verifyIdToken(token);
  } catch {
    throw new RequestAuthError(401, "Sua sessão não pôde ser confirmada. Entre novamente.");
  }
}

export function assertAdministrator(user: DecodedIdToken) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!user.email || !admins.includes(user.email.toLowerCase())) {
    throw new RequestAuthError(403, "Este acesso é restrito ao administrador.");
  }
}
