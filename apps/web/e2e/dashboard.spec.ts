import { expect, test } from "@playwright/test";

test("renders a safe, accessible contract preview", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/");

  await expect(page).toHaveTitle(/MixTogether/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Private savings.Provable chances.",
  );
  await expect(page.getByRole("region", { name: "Savings dashboard" })).toBeVisible();
  await expect(page.locator(".deployment-banner")).toContainText("Contract preview mode");
  await expect(page.getByRole("button", { name: "Deposit" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Claim private winnings" })).toBeDisabled();
  await expect(page.getByRole("article", { name: "Recent draw history" })).toContainText(
    "Completed draws will appear here without exposing winner addresses.",
  );
  await expect(page.getByText("Private amounts, public participation.")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("keeps the full dashboard inside a mobile viewport", async ({ page }) => {
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Private balance room" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open" })).toBeVisible();
});
