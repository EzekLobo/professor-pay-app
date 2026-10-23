import { expect, test } from "@playwright/test";

const demoRoutes = ["dashboard", "payments", "classes", "lessons", "corrections", "settings", "data"];

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "celular", width: 390, height: 844 },
  { name: "celular pequeno", width: 320, height: 844 },
]) {
  test(`layout não estoura a viewport em ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of demoRoutes) {
      await page.goto(`/demo#${route}`);
      await expect(page.getByText("Demonstração — dados fictícios")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `estouro horizontal em ${route}`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }
  });
}

test("navegação móvel mantém todas as áreas visíveis e identificadas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo#data");
  const navigation = page.getByRole("navigation", { name: "Navegação principal" });
  for (const label of ["Resumo", "Pagamentos", "Turmas", "Aulas", "Acompanhamento", "Configurações", "Dados e backup"]) {
    const link = navigation.getByRole("link", { name: label });
    await expect(link).toBeVisible();
    await expect(link).toBeInViewport();
  }
  await expect(navigation.getByRole("link", { name: "Dados e backup" })).toHaveAttribute("aria-current", "page");
});

test("atalho de teclado e importação possuem nomes acessíveis", async ({ page }) => {
  await page.goto("/demo#data");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused();
  await expect(page.getByLabel("Arquivo de backup JSON")).toBeVisible();
});

for (const width of [320, 390]) {
  test(`filtros de atividades não se sobrepõem em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/demo#corrections");
    const compact = page.getByRole("button", { name: "Compacto", exact: true });
    const grouping = page.getByRole("combobox", { name: "Organizar atividades" });
    await expect(compact).toBeVisible();
    await expect(grouping).toBeVisible();
    const switchBox = await compact.boundingBox();
    const groupingBox = await grouping.boundingBox();
    expect(switchBox).not.toBeNull();
    expect(groupingBox).not.toBeNull();
    expect(switchBox!.y + switchBox!.height).toBeLessThanOrEqual(groupingBox!.y);
    await compact.click();
    await expect(compact).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Buscar correção")).toBeVisible();
  });
}

test("editor de cursos preserva a hierarquia dos botões", async ({ page }) => {
  await page.goto("/demo#lessons");
  await page.getByRole("button", { name: "Criar novo curso" }).click();
  const cancel = page.getByRole("dialog", { name: "Criar novo curso" }).getByRole("button", { name: "Cancelar", exact: true });
  await expect(cancel).toHaveClass(/button-ghost/);
  await expect(cancel).not.toHaveClass(/button-primary/);
  await expect(cancel).toHaveCSS("box-shadow", "none");
});

test("curso rejeita URL inválida e confirma substituição sem caixa nativa", async ({ page }) => {
  page.on("dialog", () => { throw new Error("Caixa nativa inesperada"); });
  await page.goto("/demo#lessons");
  await page.getByRole("button", { name: "Criar novo curso" }).click();
  const course = page.getByRole("dialog", { name: "Criar novo curso", exact: true });
  await course.getByLabel("Nome do curso").fill("Curso revisado");
  await course.getByLabel("Aulas por módulo").fill("1");
  await course.getByRole("button", { name: "Gerar estrutura" }).click();
  await course.getByLabel("Slides (link)").fill("endereco-invalido");
  await course.getByRole("button", { name: "Salvar curso" }).click();
  await expect(course.getByRole("alert")).toContainText("link http(s) válido");
  await expect(course).toBeVisible();
  await course.getByLabel("Título", { exact: true }).fill("Material preservado");
  await course.getByRole("button", { name: "Gerar estrutura" }).click();
  const confirmation = page.getByRole("dialog", { name: "Substituir estrutura", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(course.getByLabel("Título", { exact: true })).toHaveValue("Material preservado");
  await course.getByRole("button", { name: "Gerar estrutura" }).click();
  await confirmation.getByRole("button", { name: "Substituir estrutura", exact: true }).click();
  await expect(course.getByLabel("Título", { exact: true })).toHaveValue("Aula 1.1");
  await course.getByLabel("Slides (link)").fill("https://example.com/slides");
  await course.getByRole("button", { name: "Salvar curso" }).click();
  await expect(course).not.toBeVisible();
});

test("recebimento e estorno pedem confirmação no modal da aplicação", async ({ page }) => {
  page.on("dialog", () => { throw new Error("Caixa nativa inesperada"); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo#payments");
  await page.evaluate(() => localStorage.setItem("nexusclass:modal-guide:demo-payment-statement:v2", "1"));
  await page.locator(".payment-carousel-card.is-focus").click();
  const statement = page.getByRole("dialog", { name: /^Extrato/ });
  await statement.getByRole("button", { name: "Confirmar recebimento", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirmar recebimento", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(statement.getByRole("button", { name: "Confirmar recebimento", exact: true })).toBeVisible();
  await statement.getByRole("button", { name: "Confirmar recebimento", exact: true }).click();
  await confirmation.getByRole("button", { name: "Confirmar recebimento", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await statement.getByRole("button", { name: "Estornar confirmação", exact: true }).click();
  const reversal = page.getByRole("dialog", { name: "Estornar confirmação", exact: true });
  await expect(reversal).toBeVisible();
  await reversal.getByRole("button", { name: "Estornar confirmação", exact: true }).click();
  await expect(reversal).not.toBeVisible();
  await expect(statement.getByRole("button", { name: "Confirmar recebimento", exact: true })).toBeVisible();
});
