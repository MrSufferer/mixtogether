import { expect, test } from "@playwright/test";

test("shows the Shroudly Preprod identity and deterministic participant journey", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Shroudly/);
  await expect(page.getByText(/Shroudly Preprod/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Lace" })).toBeVisible();

  await page.getByRole("button", { name: "Connect Lace" }).click();
  await expect(page.getByText(/preprod · API 4\.0\.1/)).toBeVisible();
  await expect(page.getByText("Recovery Kit", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Use DUST sponsor" }).click();
  await expect(page.getByRole("status")).toContainText("DUST sponsor selected");
  await page.getByRole("button", { name: "Wallet-funded DUST" }).click();
  await expect(page.getByRole("status")).toContainText("Wallet-funded DUST selected");

  await page.getByRole("button", { name: "Claim" }).click();
  await expect(page.getByRole("status")).toContainText("confirmed");

  await page.locator("#amount").fill("1.0000001");
  await page.getByRole("button", { name: "Contribute" }).click();
  await expect(page.getByRole("status")).toContainText(/at most 6 decimal places|valid amount/);

  await page.locator("#amount").fill("10");
  await page.getByRole("button", { name: "Contribute" }).click();
  await expect(page.getByRole("status")).toContainText("confirmed");
  await expect(page.getByText("Time-Weighted Principal")).toBeVisible();

  const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
