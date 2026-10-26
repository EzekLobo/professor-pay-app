import { expect, test } from "@playwright/test";

for (const width of [1440, 390, 320]) {
  test(`listas personalizadas preservam tarefas e arquivo em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo#tasks");
    await page.getByRole("button", { name: "Listas", exact: true }).click();
    const manager = page.getByRole("dialog", { name: "Organizar listas", exact: true });
    await manager.getByRole("textbox", { name: "Nome da lista 1", exact: true }).fill("Planejar");
    await manager.locator(".task-list-row").filter({ has: page.getByRole("textbox", { name: "Nome da lista 3", exact: true }) }).getByRole("button", { name: "Excluir lista", exact: true }).click();
    const deletion = page.getByRole("dialog", { name: "Excluir lista", exact: true });
    await expect(deletion).toContainText("1 tarefa(s)");
    await deletion.getByRole("combobox", { name: "Destino das tarefas", exact: true }).selectOption("todo");
    await deletion.getByRole("button", { name: "Excluir lista e mover tarefas", exact: true }).click();
    await expect(manager).not.toBeVisible();
    await expect(page.getByRole("region", { name: "Aguardando", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resolver acesso de um aluno", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Planejar", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Listas", exact: true }).click();
    await manager.getByRole("button", { name: "Nova lista", exact: true }).click();
    await manager.getByRole("textbox", { name: "Nome da lista 4", exact: true }).fill("Revisão");
    await manager.getByRole("button", { name: "Salvar listas", exact: true }).click();
    await expect(manager).not.toBeVisible();
    await page.getByRole("combobox", { name: "Mover Preparar a próxima aula para", exact: true }).selectOption({ label: "Revisão" });
    if (width <= 720) {
      const selector = page.getByRole("combobox", { name: "Etapa das tarefas", exact: true });
      const value = await selector.locator("option").filter({ hasText: "Revisão" }).getAttribute("value");
      await selector.selectOption(value!);
    }
    await expect(page.getByRole("button", { name: "Preparar a próxima aula", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Listas", exact: true }).click();
    const reviewRow = manager.locator(".task-list-row").filter({ has: page.getByRole("textbox", { name: "Nome da lista 4", exact: true }) });
    await reviewRow.getByRole("button", { name: "Arquivar lista", exact: true }).click();
    await manager.getByRole("button", { name: "Salvar listas", exact: true }).click();
    await expect(page.getByRole("button", { name: "Preparar a próxima aula", exact: true })).not.toBeVisible();
    await page.getByRole("button", { name: "Ver arquivo", exact: true }).click();
    await expect(page.getByRole("button", { name: "Preparar a próxima aula", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Listas", exact: true }).click();
    await reviewRow.getByRole("button", { name: "Restaurar lista", exact: true }).click();
    await manager.getByRole("button", { name: "Salvar listas", exact: true }).click();
    await expect(page.getByRole("button", { name: "Preparar a próxima aula", exact: true })).not.toBeVisible();
    await page.getByRole("button", { name: "Voltar ao quadro", exact: true }).click();
    if (width <= 720) { const option = page.getByRole("combobox", { name: "Etapa das tarefas", exact: true }).locator("option").filter({ hasText: "Revisão" }); await page.getByRole("combobox", { name: "Etapa das tarefas", exact: true }).selectOption((await option.getAttribute("value"))!); }
    await page.getByRole("button", { name: "Preparar a próxima aula", exact: true }).click();
    await page.getByRole("dialog", { name: "Editar tarefa", exact: true }).getByRole("button", { name: "Excluir definitivamente", exact: true }).click();
    await page.getByRole("dialog", { name: "Excluir tarefa", exact: true }).getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByRole("button", { name: "Preparar a próxima aula", exact: true })).not.toBeVisible();
    await page.getByRole("button", { name: "Listas", exact: true }).click();
    await reviewRow.getByRole("button", { name: "Excluir lista", exact: true }).click();
    await deletion.getByRole("button", { name: "Excluir lista", exact: true }).click();
    await expect(manager).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/task-lists-${width}.png` });
  });
}

test("exclusão confirmada pode esvaziar o quadro e permite criar outra lista", async ({ page }) => {
  await page.goto("/demo#tasks");
  const manager = page.getByRole("dialog", { name: "Organizar listas", exact: true });
  for (let remaining = 4; remaining > 0; remaining--) {
    await page.getByRole("button", { name: "Listas", exact: true }).click();
    await manager.locator(".task-list-row").first().getByRole("button", { name: "Excluir lista", exact: true }).click();
    const deletion = page.getByRole("dialog", { name: "Excluir lista", exact: true });
    if (await deletion.getByRole("combobox", { name: "Destino das tarefas", exact: true }).count()) {
      await deletion.getByRole("combobox", { name: "Destino das tarefas", exact: true }).selectOption("__delete__");
      await deletion.getByRole("button", { name: "Excluir lista e tarefas", exact: true }).click();
    } else await deletion.getByRole("button", { name: "Excluir lista", exact: true }).click();
    await expect(manager).not.toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Nova tarefa", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Nova tarefa", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Organizar listas", exact: true }).click();
  await manager.getByRole("button", { name: "Nova lista", exact: true }).click();
  await manager.getByRole("textbox", { name: "Nome da lista 1", exact: true }).fill("Meu fluxo");
  await manager.getByRole("button", { name: "Salvar listas", exact: true }).click();
  await expect(manager).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Nova tarefa", exact: true })).toBeEnabled();
  await expect(page.getByRole("region", { name: "Meu fluxo", exact: true })).toBeVisible();
});
