import { test, expect } from "@playwright/test";

/**
 * Smoke E2E: the public landing page renders and links to auth.
 * This test does not require a database. DB-dependent flows (register ->
 * dashboard) should be added as a separate suite gated on a live DATABASE_URL.
 */
test("landing page loads with primary CTAs", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: /the crm built for growing sales teams/i,
    }),
  ).toBeVisible();

  await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
});

test("unauthenticated access to /app redirects to login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});
