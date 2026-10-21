"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
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
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);
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

  async function recoverPassword() {
    const normalizedEmail = email.trim();
    setError(undefined);
    setMessage(undefined);
    if (!normalizedEmail) {
      setError("Informe seu e-mail para receber o link de recuperação.");
      return;
    }
    setRecovering(true);
    try {
      await resetFirebasePassword(normalizedEmail);
      setMessage("Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.");
    } catch (cause) {
      const code = cause instanceof FirebaseError ? cause.code : "";
      setError(
        code === "auth/invalid-email"
          ? "Informe um e-mail válido."
          : code === "auth/too-many-requests"
            ? "Muitas tentativas. Aguarde alguns minutos e tente novamente."
            : code === "auth/network-request-failed"
              ? "Não foi possível conectar ao serviço de login. Verifique sua internet."
              : "Não foi possível enviar o link agora. Tente novamente.",
      );
    } finally {
      setRecovering(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/login" className="brand">
          <Image className="brand-mark" src="/nexusclass-icon.png" alt="" width={40} height={40} priority />NexusClass
        </Link>
        <h1>Bem-vindo de volta</h1>
        <p className="muted">Gerencie aulas, alunos e pagamentos.</p>
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
          {message && <p className="form-success" role="status">{message}</p>}
          <Button type="submit" disabled={submitting || recovering}>{submitting ? "Aguarde…" : "Entrar"}</Button>
        </form>
        <button
          className="auth-recovery-button"
          type="button"
          disabled={submitting || recovering}
          onClick={() => void recoverPassword()}
        >
          {recovering ? "Enviando link…" : "Esqueci minha senha"}
        </button>
        <button className="button button-ghost" type="button" disabled={submitting || recovering} style={{ width: "100%", marginTop: 12 }} onClick={() => router.push("/demo")}>
          Entrar como visitante
        </button>
        <p className="auth-footer">Explore com dados fictícios, sem informar credenciais.</p>
        <p className="auth-footer">O acesso é liberado pelo administrador.</p>
      </section>
    </main>
  );
}
