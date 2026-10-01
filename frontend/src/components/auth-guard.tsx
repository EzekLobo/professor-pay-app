"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@/lib/api";
import { subscribeToAuth } from "@/lib/firebase-auth";

export function AuthGuard({ children }: { children: (user: User) => ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    try {
      const unsubscribe = subscribeToAuth((currentUser) => {
        queueMicrotask(() => {
          if (!active) return;
          if (currentUser) setUser(currentUser);
          else router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          setChecking(false);
        });
      });
      return () => { active = false; unsubscribe(); };
    } catch {
      queueMicrotask(() => {
        if (!active) return;
        setChecking(false);
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      });
      return () => { active = false; };
    }
  }, [pathname, router]);

  if (checking || user === null) return <main className="auth-page"><p className="muted">Verificando sua sessão…</p></main>;
  return <>{children(user)}</>;
}
