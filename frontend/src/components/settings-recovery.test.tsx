import { renderToStaticMarkup } from "react-dom/server";
import type { AnchorHTMLAttributes } from "react";
import { expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
import { SettingsContent } from "./settings-page";
it("mantém a sincronização acessível sem esperar as configurações do Firebase", () => {
 const markup = renderToStaticMarkup(<SettingsContent accountAccess initialSection="data" />);
 expect(markup).toContain("Sincronização Kodland");
 expect(markup).toContain("Sincronizar tudo");
 expect(markup).not.toContain("Carregando configurações");
});

it("mostra acesso à administração somente quando autorizado e mesmo sem preferências carregadas",()=>{
 const owner=renderToStaticMarkup(<SettingsContent accountAccess administrator initialSection="data" />);
 const regular=renderToStaticMarkup(<SettingsContent accountAccess initialSection="data" />);
 expect(owner).toContain('href="/admin"');expect(regular).not.toContain('href="/admin"');
});
