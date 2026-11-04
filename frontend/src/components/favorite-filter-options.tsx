"use client";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";

export function FavoriteFilterOptions({ scope, options, value, onChange }: { scope: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const data = JSON.parse(localStorage.getItem(`nexusclass.favorite-filters.${scope}`) ?? "[]"); return Array.isArray(data) ? [...new Set(data.filter(item => typeof item === "string").map(item => scope.startsWith("activities.") ? (({ all: "complete", clear: "students" } as Record<string, string>)[item] ?? item) : item))] : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem(`nexusclass.favorite-filters.${scope}`, JSON.stringify(favorites)); } catch { /* Keep preferences in memory. */ } }, [favorites, scope]);
  return <div className="favorite-filter-options" role="group" aria-label="Mostrar">{[...options].sort((a, b) => Number(favorites.includes(b.value)) - Number(favorites.includes(a.value))).map(option => {
    const favorite = favorites.includes(option.value);
    return <div className="favorite-filter-row" key={option.value}><button type="button" className="favorite-filter-choice" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button><button type="button" className="favorite-filter-star" aria-label={`${favorite ? "Desfavoritar" : "Favoritar"} ${option.label}`} title={favorite ? "Remover dos favoritos" : "Fixar no topo"} aria-pressed={favorite} onClick={() => setFavorites(current => favorite ? current.filter(item => item !== option.value) : [...current, option.value])}><Star size={14} fill={favorite ? "currentColor" : "none"} aria-hidden="true" /></button></div>;
  })}</div>;
}
