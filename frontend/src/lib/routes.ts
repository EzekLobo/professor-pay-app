import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  DatabaseBackup,
  LayoutDashboard,
  ListTodo,
  Settings,
  UsersRound,
  WalletCards,
} from "lucide-react";

export type AppRoute = {
  href: string;
  label: string;
  mobileLabel: string;
  icon: LucideIcon;
};

export const navigation: AppRoute[] = [
  { href: "/dashboard", label: "Resumo", mobileLabel: "Resumo", icon: LayoutDashboard },
  { href: "/payments", label: "Pagamentos", mobileLabel: "Pagamentos", icon: WalletCards },
  { href: "/classes", label: "Turmas", mobileLabel: "Turmas", icon: UsersRound },
  { href: "/lessons", label: "Aulas", mobileLabel: "Aulas", icon: BookOpen },
];

export const tasksNavigation: AppRoute = { href: "/tasks", label: "Tarefas", mobileLabel: "Tarefas", icon: ListTodo };
export const utilityNavigation: AppRoute = { href: "/data", label: "Dados e backup", mobileLabel: "Dados", icon: DatabaseBackup };
export const settingsNavigation: AppRoute = { href: "/settings", label: "Configurações", mobileLabel: "Ajustes", icon: Settings };

export const appRoutes = [...navigation, tasksNavigation, settingsNavigation];

export function pageTitle(pathname: string) {
  return pathname === "/admin"
    ? "Administração"
    : appRoutes.find((item) => item.href === (pathname === "/corrections" ? "/classes" : pathname))?.label ?? "NexusClass";
}
