export const navigation = [
  { href: "/dashboard", label: "Resumo", icon: "◈" },
  { href: "/payments", label: "Pagamentos", icon: "◌" },
  { href: "/classes", label: "Turmas", icon: "◇" },
  { href: "/lessons", label: "Aulas", icon: "✦" },
];

export const correctionsNavigation = { href: "/corrections", label: "Correções", icon: "✓" };
export const utilityNavigation = { href: "/data", label: "Dados e backup", icon: "◫" };

export const appRoutes = [...navigation, correctionsNavigation, utilityNavigation];

export function pageTitle(pathname: string) {
  return appRoutes.find((item) => item.href === pathname)?.label ?? "NexusClass";
}
