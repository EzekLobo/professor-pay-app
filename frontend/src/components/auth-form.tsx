"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, Input } from "@/components/ui";
import { loginWithFirebase, resetFirebasePassword } from "@/lib/firebase-auth";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    setSubmitting(true);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "");
    const password = String(data.get("password"));

    try {
      await loginWithFirebase(email, password);
      router.replace(searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : "/dashboard");
    } catch (cause) {
      const code = cause instanceof FirebaseError ? cause.code : "";
      setError(
        code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-email"
          ? "E-mail ou senha inválidos. Confira os dados ou recupere a senha abaixo."
          : code === "auth/too-many-requests"
            ? "Muitas tentativas. Aguarde alguns minutos e tente novamente."
            : code === "auth/network-request-failed"
              ? "Não foi possível conectar ao serviço de login. Verifique sua internet."
              : code === "auth/operation-not-allowed"
                ? "O login por e-mail está desativado no projeto. Habilite esse método no Firebase."
                : "Não foi possível entrar agora. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword() {
    const recoveryEmail = email.trim();
    if (!recoveryEmail) {
      setError("Informe seu e-mail antes de recuperar a senha.");
      return;
    }
    setError(undefined);
    setNotice(undefined);
    setSubmitting(true);
    try {
      await resetFirebasePassword(recoveryEmail);
      setNotice("Se o e-mail estiver cadastrado, enviaremos as instruções para criar uma nova senha.");
    } catch (cause) {
      const code = cause instanceof FirebaseError ? cause.code : "";
      setError(code === "auth/invalid-email" ? "Informe um e-mail válido." : "Não foi possível enviar o e-mail de recuperação agora.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/login" className="brand">
          <span className="brand-mark">A</span>AulaPay
        </Link>
        <h1>Bem-vindo de volta</h1>
        <p className="muted">Entre para acompanhar sua vida financeira.</p>
        <form className="form" onSubmit={submit}>
          <label className="field">
            E-mail
            <Input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>
          <label className="field">
            Senha
            <Input name="password" type="password" required autoComplete="current-password" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="notice" role="status">{notice}</p>}
          <Button type="submit" disabled={submitting}>{submitting ? "Aguarde…" : "Entrar"}</Button>
        </form>
        <button className="button button-ghost" type="button" onClick={() => void resetPassword()} disabled={submitting}>Esqueci minha senha</button>
        <p className="auth-footer">O acesso é liberado pelo administrador.</p>
      </section>
    </main>
  );
}
