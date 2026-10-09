"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import type { User } from "@/lib/api";
import { logoutFromFirebase } from "@/lib/firebase-auth";
import { appRoutes, pageTitle } from "@/lib/routes";
import { GuidedTourDialog, useGuidedTour } from "@/components/guided-tour";
import { AccessTelemetry, endStoredAccessSession } from "@/components/access-telemetry";

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tour = useGuidedTour({ userId: user.id, pathname });
  const isActive = (href: string) => pathname === href;
  const canOpenAdmin = user.email.trim().toLowerCase() === "ezeklobo.dev@gmail.com";

  async function logout() {
    endStoredAccessSession();
    await logoutFromFirebase().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <div className="app-shell">
      <AccessTelemetry user={user} pathname={pathname} />
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="Ir para o resumo">
          <Image className="brand-mark" src="/nexusclass-icon.png" alt="" width={34} height={34} priority />
          <span>NexusClass</span>
        </Link>
        <p className="sidebar-caption">NAVEGAÇÃO</p>
        <nav className="nav" aria-label="Navegação principal">
          {appRoutes.map((item) => {
            const Icon = item.icon;
            return (
              <Link className={`nav-link${isActive(item.href) ? " nav-link-active" : ""}`} href={item.href} key={item.href}>
                <span aria-hidden="true"><Icon size={19} strokeWidth={2.1} /></span>
                <span>{item.label}</span>
              </Link>
            );
          })}
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
            {canOpenAdmin && (
              <Link className="header-admin-link" href="/admin" title="Abrir administração">
                <ShieldCheck size={17} strokeWidth={2.2} aria-hidden="true" />
                Administração
              </Link>
            )}
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
