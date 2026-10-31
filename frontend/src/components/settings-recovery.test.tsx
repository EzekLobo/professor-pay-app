import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SettingsContent } from "./settings-page";
it("mantém a sincronização acessível sem esperar as configurações do Firebase", () => {
 const markup = renderToStaticMarkup(<SettingsContent accountAccess initialSection="data" />);
 expect(markup).toContain("Sincronização Kodland");
 expect(markup).toContain("Sincronizar tudo");
 expect(markup).not.toContain("Carregando configurações");
});
