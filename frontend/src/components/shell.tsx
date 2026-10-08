"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { User } from "@/lib/api";
import { logoutFromFirebase } from "@/lib/firebase-auth";
import { correctionsNavigation, navigation, utilityNavigation } from "@/lib/routes";

const pageTitles: Record<string, string> = {
  "/dashboard": "Sua rotina",
  "/payments": "Pagamentos",
  "/classes": "Turmas",
  "/lessons": "Aulas",
  "/corrections": "Correções",
  "/data": "Seus dados",
};

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => pathname === href;
  const allNavigation = [...navigation, correctionsNavigation, utilityNavigation];

  async function logout() {
    await logoutFromFirebase().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="Ir para o resumo">
          <span className="brand-mark">N</span>
          <span>NexusClass</span>
        </Link>
        <p className="sidebar-caption">NAVEGAÇÃO</p>
        <nav className="nav" aria-label="Navegação principal">
          {allNavigation.map((item) => (
            <Link className={`nav-link${isActive(item.href) ? " nav-link-active" : ""}`} href={item.href} key={item.href}>
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="logout-button" type="button" onClick={logout}>
            <span aria-hidden="true">↪</span>
            <span>Sair</span>
          </button>
        </div>
      </aside>
      <section className="shell-main">
        <header className="shell-header">
          <h1 className="shell-title">{pageTitles[pathname] ?? "NexusClass"}</h1>
          <div className="header-actions">
            <div className="profile-chip" aria-label={`Perfil de ${user.name}`}>
              <span>{user.name.slice(0, 1).toUpperCase()}</span>
              <small>{user.email}</small>
            </div>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </section>
    </div>
  );
}
