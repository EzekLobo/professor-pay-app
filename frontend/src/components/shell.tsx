"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { User } from "@/lib/api";
import { logoutFromFirebase } from "@/lib/firebase-auth";
import { navigation, utilityNavigation } from "@/lib/routes";

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
          <Link className={`nav-link utility-link${isActive(utilityNavigation.href) ? " nav-link-active" : ""}`} href={utilityNavigation.href}><span aria-hidden="true">{utilityNavigation.icon}</span><span>{utilityNavigation.label}</span></Link>
          <button className="logout-button" onClick={logout}><span aria-hidden="true">↗</span> Sair</button>
        </div>
      </aside>
      <section className="shell-main">
        <header className="shell-header">
          <div><p className="header-kicker">PAINEL PESSOAL</p><strong>Olá, {user.name.split(" ")[0]}</strong></div>
          <div className="header-actions">
            <Link className="mobile-utility-link" href="/data">Dados</Link>
            <div className="profile-chip"><span>{user.name.slice(0, 1).toUpperCase()}</span><small>{user.email}</small></div>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </section>
    </div>
  );
}
