import { expect, test } from "@playwright/test";

test("rota privada redireciona visitante para login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole("heading", { name: /bem-vindo de volta/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Esqueci minha senha" })).toBeVisible();
});

test("rota de cadastro redireciona para login", async ({ page }) => {
  await page.goto("/register");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/acesso é liberado pelo administrador/i)).toBeVisible();
});

test("login inicia vazio e permite digitação por clique e teclado", async ({ page }) => {
  await page.goto("/login");
  const login = page.getByLabel("Nick ou e-mail", { exact: true });
  const password = page.getByLabel("Senha", { exact: true });
  await expect(page.locator("#nexusclass-sign-in")).toHaveAttribute("autocomplete", "on");
  await expect(login).toHaveAttribute("autocomplete", "section-nexusclass username");
  await expect(password).toHaveAttribute("autocomplete", "section-nexusclass current-password");
  await expect(page.locator("#nexusclass-sign-in [data-1p-ignore], #nexusclass-sign-in [data-lpignore], #nexusclass-sign-in [data-bwignore]")).toHaveCount(0);
  await expect(login).toHaveValue("");
  await expect(password).toHaveValue("");
  await expect(login).toHaveAttribute("readonly", "");
  await expect(password).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator(".auth-card").getByRole("alert")).toHaveText("Informe seu nick ou e-mail e sua senha para entrar.");
  await expect(login).toBeFocused();
  await login.click();
  await expect(login).toBeEditable();
  await login.fill("conta.nexusclass");
  await expect(password).toHaveAttribute("readonly", "");
  await login.press("Tab");
  await expect(password).toBeFocused();
  await expect(password).toBeEditable();
  await password.fill("senha-ficticia-do-teste");
  await expect(login).toHaveValue("conta.nexusclass");
  await expect(password).toHaveValue("senha-ficticia-do-teste");
  await page.reload();
  await expect(login).toHaveValue("");
  await expect(password).toHaveValue("");
});

test("login envia as credenciais digitadas no acesso ao NexusClass", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/auth/username", async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "invalid-login" }) });
  });
  await page.goto("/login");
  const login = page.getByLabel("Nick ou e-mail", { exact: true });
  const password = page.getByLabel("Senha", { exact: true });
  await login.click();
  await login.fill("conta.nexusclass");
  await password.click();
  await password.fill("senha-ficticia-nexusclass");
  expect(await page.locator("#nexusclass-sign-in").evaluate(form => Object.fromEntries(new FormData(form as HTMLFormElement)))).toMatchObject({ login: "conta.nexusclass", password: "senha-ficticia-nexusclass" });
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect.poll(() => submitted).toMatchObject({ username: "conta.nexusclass" });
  await expect(page.locator(".auth-card").getByRole("alert")).toHaveText("Nick, e-mail ou senha inválidos. Confira os dados ou redefina a senha abaixo.");
});
