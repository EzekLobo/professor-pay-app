"use client";

import { AuthGuard } from "@/components/auth-guard"; import { Shell } from "@/components/shell";
export default function PaymentsPage() { return <AuthGuard>{(user) => <Shell user={user}><h1>Pagamentos</h1><section className="placeholder">Seus pagamentos aparecerão aqui em breve.</section></Shell>}</AuthGuard>; }
