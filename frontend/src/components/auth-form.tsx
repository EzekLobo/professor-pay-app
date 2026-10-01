"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, Input } from "@/components/ui";
import { loginWithFirebase } from "@/lib/firebase-auth";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));

    try {
      await loginWithFirebase(email, password);
      router.replace(searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : "/dashboard");
    } catch (cause) {
      const code = cause instanceof FirebaseError ? cause.code : "";
      setError(
        code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password"
          ? "E-mail ou senha inválidos."
          : "Não foi possível entrar agora. Tente novamente.",
      );
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
            <Input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="field">
            Senha
            <Input name="password" type="password" required autoComplete="current-password" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" disabled={submitting}>{submitting ? "Aguarde…" : "Entrar"}</Button>
        </form>
        <p className="auth-footer">O acesso é liberado pelo administrador.</p>
      </section>
    </main>
  );
}
