"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { User } from "@/lib/api";
import { logoutFromFirebase } from "@/lib/firebase-auth";
import { correctionsNavigation, kodlandNavigation, navigation, utilityNavigation } from "@/lib/routes";

const pageTitles: Record<string, string> = {
  "/dashboard": "Sua rotina",
  "/payments": "Pagamentos",
  "/classes": "Turmas",
  "/lessons": "Aulas",
  "/kodland": "Central pedagógica",
  "/corrections": "Correções",
  "/data": "Seus dados",
};

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => pathname === href;

  async function logout() {
    await logoutFromFirebase().catch(() => undefined);
    router.replace("/login");
  }

  const allNavigation = [...navigation, correctionsNavigation, kodlandNavigation, utilityNavigation];

  return (
    <div className="app-shell">
      <section className="shell-main">
        <header className="shell-header">
          <Link className="brand" href="/dashboard" aria-label="Ir para o resumo">
            <span className="brand-mark">A</span>
            <span>AulaPay</span>
          </Link>
          <h1 className="shell-title">{pageTitles[pathname] ?? "AulaPay"}</h1>
          <div className="header-actions">
            <div className="profile-chip" aria-label={`Perfil de ${user.name}`}>
              <span>{user.name.slice(0, 1).toUpperCase()}</span>
              <span className="profile-name">{user.name}</span>
            </div>
          </div>
        </header>
        <nav className="top-nav" aria-label="Navegação principal">
          <div className="top-nav-links">
            {allNavigation.map((item) => (
              <Link className={`nav-link${isActive(item.href) ? " nav-link-active" : ""}`} href={item.href} key={item.href}>
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
            <button className="nav-link logout-button" type="button" onClick={logout}>
              <span aria-hidden="true">↪</span>
              <span>Sair</span>
            </button>
          </div>
        </nav>
        <main className="page-content">{children}</main>
      </section>
    </div>
  );
}
