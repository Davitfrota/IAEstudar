import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("landing carrega", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("sign-in carrega", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1 }).or(page.locator("form")).first()).toBeVisible();
  });

  test("health endpoint responde", async ({ request }) => {
    const res = await request.get("/api/health");
    expect([200, 503]).toContain(res.status());
    expect(res.headers()["content-type"] ?? "").toMatch(/json/);
    const body = await res.json();
    expect(body.checks).toBeTruthy();
    expect(body.readyFor).toBeTruthy();
  });

  test("rota protegida redireciona sem sessão", async ({ page }) => {
    await page.goto("/agente");
    await expect(page).toHaveURL(/sign-in/);
  });
});

test.describe("multi-user auth gate", () => {
  test("API agent chat exige auth", async ({ request }) => {
    const res = await request.post("/api/agent/chat", {
      data: { message: "oi" },
      maxRedirects: 0,
    });
    expect(res.status()).toBeGreaterThanOrEqual(401);
    expect(res.status()).toBeLessThan(500);
  });

  test("confirm de plano inexistente não vaza dados", async ({ request }) => {
    const res = await request.post("/api/agent/plan/not-a-real-plan/confirm", {
      maxRedirects: 0,
    });
    expect([401, 403, 404, 410]).toContain(res.status());
  });
});

const e2eEmail = process.env.E2E_EMAIL;
const e2ePassword = process.env.E2E_PASSWORD;

test.describe("authenticated smoke", () => {
  test.skip(!e2eEmail || !e2ePassword, "Defina E2E_EMAIL e E2E_PASSWORD");

  test("login + troca de tema", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(e2eEmail!);
    await page.getByLabel("Senha").fill(e2ePassword!);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/pastas|agente|agenda|formularios/, { timeout: 30_000 });

    const switcher = page.getByRole("button", {
      name: /Tema atual/i,
    });
    await expect(switcher).toBeVisible();
    const before = await switcher.textContent();
    await switcher.click();
    await expect(switcher).not.toHaveText(before ?? "");
  });
});
