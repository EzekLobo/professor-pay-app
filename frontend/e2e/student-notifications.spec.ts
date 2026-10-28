import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1440]) {
  test(`notificações levam ao caso e confirmam contato sem presumir envio (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const privateCalls: string[] = [];
    page.on("request", request => { if (/firestore.googleapis|identitytoolkit|\/api\/kodland/.test(request.url())) privateCalls.push(request.url()); });
    await page.goto("/demo#settings");
    await expect(page.getByRole("tab", { name: "Notificações", exact: true })).toBeVisible();
    // A real demo occurrence and its assigned activities form the fixture.
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("nexusclass.demo.v2")!);
      const snapshot = raw.snapshot;
      const occurrence = snapshot.manualOccurrences.find((item: { lesson_date: string }) => item.lesson_date < snapshot.today);
      const student = snapshot.manualStudents[0];
      snapshot.manualAttendance = snapshot.manualAttendance.map((item: { occurrence_id: string }) => item.occurrence_id === occurrence.id ? { ...item, status: "ABSENT" } : item);
      snapshot.manualActivities = ["classroom", "homework"].map(kind => ({ id: `demo-manual-notification-${kind}`, class_id: occurrence.class_id, student_id: student.id, occurrence_id: occurrence.id, title: kind === "classroom" ? "Exercício da aula" : "Lista para casa", description: "", submission_text: "", submission_url: "", feedback: "", status: "assigned", kind, due_at: `${occurrence.lesson_date}T23:59:00Z`, required: true, exempt: false, created_at: snapshot.today, updated_at: snapshot.today }));
      localStorage.setItem("nexusclass.demo.v2", JSON.stringify(raw));
    });
    await page.reload();
    await page.getByRole("tab", { name: "Notificações", exact: true }).click();
    await page.getByRole("checkbox", { name: "Ativar notificações", exact: true }).check();
    await page.getByLabel("Acompanhar aulas a partir de").fill("2020-01-01");
    await page.getByRole("button", { name: "Ver prévia", exact: true }).click();
    await expect(page.getByText(/Prévia: [1-9]/)).toBeVisible();
    await page.getByRole("button", { name: "Salvar notificações", exact: true }).click();
    await expect(page.getByText("Regras de notificações salvas.")).toBeVisible();
    await page.getByRole("button", { name: /Notificações: \d+ pendentes/ }).click();
    const dialog = page.getByRole("dialog", { name: "Notificações", exact: true });
    await dialog.getByLabel("Motivo", { exact: true }).selectOption("classroom");
    await expect(dialog.locator(".notification-card")).toHaveCount(1);
    await page.screenshot({ path: `../work/notifications-panel-${width}.png`, fullPage: true });
    await dialog.getByRole("link", { name: "Resolver", exact: true }).click();
    const resolution = page.getByRole("region", { name: "Resolver notificação" });
    await expect(resolution).toContainText("Exercício da aula");
    await expect(resolution.getByRole("button", { name: "Confirmar contato realizado" })).toBeEnabled();
    expect(await resolution.getByRole("link", { name: "Abrir WhatsApp" }).getAttribute("href")).toContain("wa.me/");
    await page.screenshot({ path: `../work/notifications-resolution-${width}.png`, fullPage: true });
    await resolution.getByRole("button", { name: "Confirmar contato realizado" }).click();
    await expect(resolution.getByText("Contato confirmado para esta pendência.")).toBeVisible();
    await page.reload();
    await expect(resolution.getByText("Contato confirmado para esta pendência.")).toBeVisible();
    // A second case on the same route must change the resolved context.
    await page.getByRole("button", { name: /Notificações: \d+ pendentes/ }).click();
    await dialog.getByLabel("Motivo", { exact: true }).selectOption("homework");
    await dialog.getByRole("link", { name: "Resolver", exact: true }).click();
    await expect(resolution).toContainText("Lista para casa");
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
    expect(privateCalls).toEqual([]);
  });
}
