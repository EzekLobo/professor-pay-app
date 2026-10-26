"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, useState } from "react";
import { CalendarDays, HelpCircle, MoreHorizontal, ShieldCheck } from "lucide-react";
import type { User } from "@/lib/api";
import { logoutFromFirebase } from "@/lib/firebase-auth";
import { appRoutes, pageTitle } from "@/lib/routes";
import { GuidedTourDialog, useGuidedTour } from "@/components/guided-tour";
import { AccessTelemetry, endStoredAccessSession } from "@/components/access-telemetry";
import { ReleaseNotes } from "@/components/release-notes";
import { Modal } from "@/components/modal";
import { HolidayCalendarDialog } from "@/components/holiday-calendar-dialog";

type ShellFrameProps = {
  user: User;
  pathname: string;
  children: ReactNode;
  routeHref?: (href: string) => string;
  onNavigate?: (href: string) => void;
  onLogout: () => void;
  logoutLabel?: string;
  headerActions?: ReactNode;
  banner?: ReactNode;
};

export function ShellFrame({ user, pathname, children, routeHref = (href) => href, onNavigate, onLogout, logoutLabel = "Sair", headerActions, banner }: ShellFrameProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryPaths = ["/dashboard", "/payments", "/classes", "/lessons"];
  const secondaryRoutes = appRoutes.filter((item) => !primaryPaths.includes(item.href));
  const isActive = (href: string) => pathname === href;
  const settingsRoutes = appRoutes.filter((item) => item.href === "/data" || item.label === "Configurações");
  const mainRoutes = appRoutes.filter((item) => !settingsRoutes.includes(item));
  const renderNavLink = (item: (typeof appRoutes)[number], inMore = false) => {
    const Icon = item.icon;
    return <Link
      className={`nav-link${!inMore && !primaryPaths.includes(item.href) ? " nav-link-secondary" : ""}${isActive(item.href) ? " nav-link-active" : ""}`}
      href={routeHref(item.href)} key={item.href}
      aria-current={isActive(item.href) ? "page" : undefined} aria-label={item.label}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => { setMoreOpen(false); if (onNavigate) { event.preventDefault(); onNavigate(item.href); } }}
    >
      <span aria-hidden="true"><Icon size={19} strokeWidth={2.1} /></span>
      <span className="nav-link-label" aria-hidden="true"><span className="nav-label-full">{item.label}</span><span className="nav-label-mobile">{item.mobileLabel}</span></span>
    </Link>;
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className="sidebar">
        <Link className="brand" href={routeHref("/dashboard")} aria-label="Ir para o resumo" onClick={onNavigate ? (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); onNavigate("/dashboard"); } : undefined}>
          <Image className="brand-mark" src="/nexusclass-icon.png" alt="" width={34} height={34} priority />
          <span>NexusClass</span>
        </Link>
        <p className="sidebar-caption">NAVEGAÇÃO</p>
        <nav className="nav" aria-label="Navegação principal">
          {mainRoutes.map((item) => renderNavLink(item))}
          <button className={`nav-link mobile-more-trigger${secondaryRoutes.some((item) => isActive(item.href)) ? " nav-link-active" : ""}`} type="button" aria-label="Mais opções" aria-expanded={moreOpen} aria-controls="mobile-more-options" aria-current={secondaryRoutes.some((item) => isActive(item.href)) ? "page" : undefined} onClick={() => setMoreOpen(true)}><span aria-hidden="true"><MoreHorizontal size={19} /></span><span>Mais</span></button>
        </nav>
        <div className="sidebar-bottom">
          <nav className="sidebar-settings" aria-label="Configurações e dados">{settingsRoutes.map((item) => renderNavLink(item))}</nav>
          <button className="logout-button" type="button" onClick={onLogout}>
            <span aria-hidden="true">↪</span>
            <span>{logoutLabel}</span>
          </button>
        </div>
      </aside>
      <section className="shell-main">
        <header className="shell-header">
          <h1 className="shell-title">{pageTitle(pathname)}</h1>
          <div className="header-actions">
            {headerActions}
            <div className="profile-chip" aria-label={`Perfil de ${user.name}`}>
              <span>{user.name.slice(0, 1).toUpperCase()}</span>
              <small>{user.email}</small>
            </div>
          </div>
        </header>
        <main className="page-content" id="main-content" tabIndex={-1}>
          {banner}
          <div className="page-stage">{children}</div>
        </main>
      </section>
      <Modal open={moreOpen} title="Mais opções" onClose={() => setMoreOpen(false)} className="mobile-more-modal"><nav id="mobile-more-options" className="mobile-more-options" aria-label="Outras áreas">{secondaryRoutes.map((item) => renderNavLink(item, true))}</nav></Modal>
    </div>
  );
}

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tour = useGuidedTour({ userId: user.id, pathname });
  const [holidayCalendarOpen, setHolidayCalendarOpen] = useState(false);
  const canOpenAdmin = user.email.trim().toLowerCase() === "ezeklobo.dev@gmail.com";

  async function logout() {
    endStoredAccessSession();
    await logoutFromFirebase().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <>
      <AccessTelemetry user={user} pathname={pathname} />
      <ShellFrame user={user} pathname={pathname} onLogout={logout} headerActions={
        <>
          <ReleaseNotes userId={user.id} blocked={tour.isOpen || holidayCalendarOpen} />
          <button className="button button-ghost header-calendar-button" type="button" aria-label="Abrir calendário de feriados" title="Feriados" onClick={() => setHolidayCalendarOpen(true)}>
            <CalendarDays size={18} strokeWidth={2.2} aria-hidden="true" />
            <span>Feriados</span>
          </button>
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
              <HelpCircle size={18} aria-hidden="true" /><span>Como usar</span>
            </button>
          )}
        </>
      }>{children}</ShellFrame>
      <GuidedTourDialog tour={tour} />
      <HolidayCalendarDialog open={holidayCalendarOpen} onClose={() => setHolidayCalendarOpen(false)} />
    </>
  );
}
