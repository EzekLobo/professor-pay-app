import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1440]) {
  test(`porcentagem de atividades por turma permanece estável com busca (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo#classes");
    await page.waitForFunction(() => Boolean(localStorage.getItem("nexusclass.demo.v2")));
    const fixture = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("nexusclass.demo.v2")!);
      const snapshot = data.snapshot;
      snapshot.tutorPreferences.kodland_enabled = true;
      const group = snapshot.groups[0];
      const progress = snapshot.taskProgress.find((item: { external_class_id: string }) => item.external_class_id === group.external_id);
      const student = snapshot.students.find((item: { external_id: string }) => item.external_id === progress.external_student_id);
      snapshot.reviews = snapshot.reviews.filter((item: { external_class_id: string }) => item.external_class_id !== group.external_id);
      const activities = snapshot.taskProgress.filter((item: { external_class_id: string }) => item.external_class_id === group.external_id);
      const done = activities.filter((item: { state: string }) => ["submitted", "corrected", "delivered"].includes(item.state)).length;
      const unknown = activities.filter((item: { state: string }) => item.state === "unknown").length;
      const label = `${done}/${activities.length} atividades feitas · ${Math.round(done * 100 / activities.length)}%${unknown ? ` parcial · ${unknown} sem informação` : ""}`;
      localStorage.setItem("nexusclass.demo.v2", JSON.stringify(data));
      return { group: group.title, student: student.name, label };
    });
    await page.reload();
    const group = page.locator(".compact-activities-class").filter({ has: page.getByRole("heading", { name: fixture.group, exact: true }) });
    const indicator = group.locator(".compact-class-activity-completion");
    await expect(indicator).toHaveText(fixture.label);
    await group.locator("summary").click();
    await page.getByRole("button", { name: "Abrir busca", exact: true }).click();
    await page.getByLabel("Buscar correção").fill(fixture.student);
    await expect(indicator).toHaveText(fixture.label);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/activity-completion-${width}.png`, fullPage: true });
    await page.reload();
    await expect(indicator).toHaveText(fixture.label);
  });
}
