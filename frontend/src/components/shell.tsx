"use client";

import Link from "next/link";
import { OperationalErrorBoundary, OperationTelemetry } from "./operation-telemetry";
import { StudentNotificationsProvider, StudentNotificationBell } from "./student-notifications";
import type { DemoSnapshot } from "@/lib/demo-snapshot";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, HelpCircle, Settings } from "lucide-react";
import type { User } from "@/lib/api";
import { logoutFromFirebase } from "@/lib/firebase-auth";
import { appRoutes, pageTitle } from "@/lib/routes";
import { GuidedTourDialog, useGuidedTour } from "@/components/guided-tour";
import { AccessTelemetry, endStoredAccessSession } from "@/components/access-telemetry";
import { ReleaseNotesProvider } from "@/components/release-notes";
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
  notificationSnapshot?: DemoSnapshot | null;
  onNotificationDemoChange?: (change: (value: DemoSnapshot) => DemoSnapshot) => void;
};

export function ShellFrame({ user, pathname, children, routeHref = (href) => href, onNavigate, onLogout, logoutLabel = "Sair", headerActions, banner, notificationSnapshot, onNotificationDemoChange }: ShellFrameProps) {
  const navigation = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) navigation.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  const isActive = (href: string) => pathname === href;
  const settingsRoutes = appRoutes.filter((item) => item.href === "/data" || item.label === "Configurações");
  const mainRoutes = appRoutes.filter((item) => !settingsRoutes.includes(item));
  const renderNavLink = (item: (typeof appRoutes)[number]) => {
    const Icon = item.icon;
    return <Link
      className={`nav-link${isActive(item.href) ? " nav-link-active" : ""}`}
      href={routeHref(item.href)} key={item.href}
      aria-current={isActive(item.href) ? "page" : undefined} aria-label={item.label}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => { if (onNavigate) { event.preventDefault(); onNavigate(item.href); } }}
    >
      <span aria-hidden="true"><Icon size={19} strokeWidth={2.1} /></span>
      <span className="nav-link-label" aria-hidden="true"><span className="nav-label-full">{item.label}</span><span className="nav-label-mobile">{item.mobileLabel}</span></span>
    </Link>;
  };
  return (
    <ReleaseNotesProvider key={user.id} userId={user.id} routeHref={routeHref}><StudentNotificationsProvider uid={user.id} snapshot={notificationSnapshot} onDemoChange={onNotificationDemoChange}>
    <div className="app-shell">
      <OperationTelemetry uid={user.id} />
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className="sidebar">
        <Link className="brand" href={routeHref("/dashboard")} aria-label="Ir para o resumo" onClick={onNavigate ? (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); onNavigate("/dashboard"); } : undefined}>
          <Image className="brand-mark" src="/nexusclass-icon.png" alt="" width={34} height={34} priority />
          <span>NexusClass</span>
        </Link>
        <p className="sidebar-caption">NAVEGAÇÃO</p>
        <nav ref={navigation} className="nav" aria-label="Navegação principal">
          {mainRoutes.map((item) => renderNavLink(item))}

        </nav>
        <div className="sidebar-bottom">
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
            <StudentNotificationBell />
            <Link className="button button-ghost header-settings-button" aria-label="Configurações" title="Configurações" aria-current={pathname === "/settings" ? "page" : undefined} href={routeHref("/settings")} onClick={onNavigate ? (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); onNavigate("/settings"); } : undefined}><Settings size={20} aria-hidden="true" /></Link>
            {headerActions}
            <div className="profile-chip" aria-label={`Perfil de ${user.name}`}>
              <span>{user.name.slice(0, 1).toUpperCase()}</span>
              <small>{user.email}</small>
            </div>
          </div>
        </header>
        <main className="page-content" id="main-content" tabIndex={-1}>
          {banner}
          <div className="page-stage"><OperationalErrorBoundary key={pathname}>{children}</OperationalErrorBoundary></div>
        </main>
      </section>

    </div>
    </StudentNotificationsProvider></ReleaseNotesProvider>
  );
}

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tour = useGuidedTour({ userId: user.id, pathname });
  const [holidayCalendarOpen, setHolidayCalendarOpen] = useState(false);

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
          <button className="button button-ghost header-calendar-button" type="button" aria-label="Abrir calendário de feriados" title="Feriados" onClick={() => setHolidayCalendarOpen(true)}>
            <CalendarDays size={18} strokeWidth={2.2} aria-hidden="true" />
            <span>Feriados</span>
          </button>
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
