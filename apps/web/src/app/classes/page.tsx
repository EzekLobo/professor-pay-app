"use client";

import { AuthGuard } from "@/components/auth-guard"; import { Shell } from "@/components/shell";
export default function ClassesPage() { return <AuthGuard>{(user) => <Shell user={user}><h1>Turmas</h1><section className="placeholder">Gerenciamento de turmas em breve.</section></Shell>}</AuthGuard>; }
