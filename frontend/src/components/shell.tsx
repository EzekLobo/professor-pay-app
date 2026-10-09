"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { User } from "@/lib/api";
import { logoutFromFirebase } from "@/lib/firebase-auth";
import { appRoutes, pageTitle } from "@/lib/routes";
import { GuidedTourDialog, useGuidedTour } from "@/components/guided-tour";

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tour = useGuidedTour({ userId: user.id, pathname });
  const isActive = (href: string) => pathname === href;

  async function logout() {
    await logoutFromFirebase().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="Ir para o resumo">
          <Image className="brand-mark" src="/nexusclass-icon.png" alt="" width={34} height={34} priority />
          <span>NexusClass</span>
        </Link>
        <p className="sidebar-caption">NAVEGAÇÃO</p>
        <nav className="nav" aria-label="Navegação principal">
          {appRoutes.map((item) => (
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
          <h1 className="shell-title">{pageTitle(pathname)}</h1>
          <div className="header-actions">
            {tour.tutorial && (
              <button
                className="button button-ghost header-tour-button"
                type="button"
                aria-label={`Abrir guia de como usar: ${tour.tutorial.steps[0]?.title ?? "esta página"}`}
                title="Como usar esta página"
                onClick={(event) => tour.open(event.currentTarget)}
              >
                Como usar
              </button>
            )}
            <div className="profile-chip" aria-label={`Perfil de ${user.name}`}>
              <span>{user.name.slice(0, 1).toUpperCase()}</span>
              <small>{user.email}</small>
            </div>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </section>
      <GuidedTourDialog tour={tour} />
    </div>
  );
}
