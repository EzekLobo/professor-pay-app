import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "@/lib/firebase-admin";

/** First owner of this deployment. Additional administrators are configured with ADMIN_EMAILS. */
const ownerAdministrator = "ezeklobo.dev@gmail.com";

export function isOwnerAdministrator(email: string | null | undefined) {
  return email?.trim().toLowerCase() === ownerAdministrator;
}

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
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/credential|service account|default credentials|private key|project id/i.test(message)) {
      throw new RequestAuthError(503, "A auditoria ainda não está configurada no servidor. Cadastre FIREBASE_SERVICE_ACCOUNT_JSON na Vercel e faça um novo deploy.");
    }
    throw new RequestAuthError(401, "Sua sessão não pôde ser confirmada. Entre novamente.");
  }
}

export function assertAdministrator(user: DecodedIdToken) {
  const admins = [ownerAdministrator, ...(process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)];
  if (!user.email || !admins.includes(user.email.toLowerCase())) {
    throw new RequestAuthError(403, "Este acesso é restrito ao administrador.");
  }
}
