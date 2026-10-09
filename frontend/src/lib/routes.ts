import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ClipboardCheck,
  DatabaseBackup,
  LayoutDashboard,
  UsersRound,
  WalletCards,
} from "lucide-react";

export type AppRoute = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navigation: AppRoute[] = [
  { href: "/dashboard", label: "Resumo", icon: LayoutDashboard },
  { href: "/payments", label: "Pagamentos", icon: WalletCards },
  { href: "/classes", label: "Turmas", icon: UsersRound },
  { href: "/lessons", label: "Aulas", icon: BookOpen },
];

export const correctionsNavigation: AppRoute = { href: "/corrections", label: "Correções", icon: ClipboardCheck };
export const utilityNavigation: AppRoute = { href: "/data", label: "Dados e backup", icon: DatabaseBackup };

export const appRoutes = [...navigation, correctionsNavigation, utilityNavigation];

export function pageTitle(pathname: string) {
  return pathname === "/admin"
    ? "Administração"
    : appRoutes.find((item) => item.href === pathname)?.label ?? "NexusClass";
}
