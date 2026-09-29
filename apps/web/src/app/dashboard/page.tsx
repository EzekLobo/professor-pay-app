"use client";

import { AuthGuard } from "@/components/auth-guard"; import { Shell } from "@/components/shell"; import { StatusBadge } from "@/components/ui";
export default function DashboardPage() { return <AuthGuard>{(user) => <Shell user={user}><StatusBadge tone="success">Sessão ativa</StatusBadge><h1>Resumo financeiro</h1><section className="placeholder"><p className="muted">Seu resumo financeiro aparecerá aqui na próxima etapa.</p></section></Shell>}</AuthGuard>; }
