import { expect, test } from "@playwright/test";

test("keeps the Preprod dashboard accessible and inside a mobile viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Shroudly/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Save privately");
  const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("offers labeled amount input and keyboard-visible focus", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect Lace" }).click();
  const amount = page.getByLabel("Amount (1–1,000 tMIX)");
  await expect(amount).toBeVisible();
  await amount.focus();
  await expect(amount).toBeFocused();
  expect(await amount.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
});
