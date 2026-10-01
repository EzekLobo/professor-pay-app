"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { User } from "@/lib/api";
import { logoutFromFirebase } from "@/lib/firebase-auth";
import { correctionsNavigation, kodlandNavigation, navigation, utilityNavigation } from "@/lib/routes";

const pageTitles: Record<string, string> = {
  "/dashboard": "Sua rotina Kodland",
  "/payments": "Pagamentos",
  "/classes": "Turmas",
  "/lessons": "Aulas",
  "/kodland": "Kodland",
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard"><span className="brand-mark">A</span><span>AulaPay</span></Link>
        <p className="sidebar-caption">GESTÃO FINANCEIRA</p>
        <nav className="nav" aria-label="Navegação principal">
          {navigation.map((item) => <Link className={`nav-link${isActive(item.href) ? " nav-link-active" : ""}`} href={item.href} key={item.href}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>)}
        </nav>
        <div className="sidebar-bottom">
          {[correctionsNavigation, kodlandNavigation, utilityNavigation].map((item) => <Link className={`nav-link utility-link${isActive(item.href) ? " nav-link-active" : ""}`} href={item.href} key={item.href}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>)}
          <button className="logout-button" onClick={logout}><span aria-hidden="true">↗</span> Sair</button>
        </div>
      </aside>
      <section className="shell-main">
        <header className="shell-header">
          <h1 className="shell-title">{pageTitles[pathname] ?? "AulaPay"}</h1>
          <div className="header-actions">
            <Link className="mobile-utility-link" href="/data">Dados</Link>
            <div className="profile-chip" aria-label={`Perfil de ${user.name}`}><span>{user.name.slice(0, 1).toUpperCase()}</span></div>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </section>
    </div>
  );
}
