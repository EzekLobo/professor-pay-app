"use client";

import { AuthGuard } from "@/components/auth-guard"; import { Shell } from "@/components/shell";
export default function LessonsPage() { return <AuthGuard>{(user) => <Shell user={user}><h1>Aulas</h1><section className="placeholder">Histórico de aulas em breve.</section></Shell>}</AuthGuard>; }
