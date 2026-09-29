"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { authApi, type User } from "@/lib/api";
export function AuthGuard({ children }: { children: (user: User) => ReactNode }) {
  const router = useRouter(); const pathname = usePathname(); const [user, setUser] = useState<User | null>(null); const [checking, setChecking] = useState(true);
  useEffect(() => { let active = true; authApi.me().then((currentUser) => { if (active) setUser(currentUser); }).catch(() => { if (active) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }).finally(() => { if (active) setChecking(false); }); return () => { active = false; }; }, [pathname, router]);
  if (checking || user === null) return <main className="auth-page"><p className="muted">Verificando sua sessão…</p></main>;
  return <>{children(user)}</>;
}
