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
    "Completed draws will appear here without exposing private outcomes.",
  );
  await expect(page.getByText("Nominal prize", { exact: true })).toBeVisible();
  await expect(page.getByText(/Actual award depends on the private reserve/)).toBeVisible();
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

test("supports keyboard focus, labeled amount, live status, and reduced motion", async ({
  page,
}) => {
  await page.goto("/");

  const amount = page.getByLabel("Amount");
  await expect(amount).toBeVisible();
  await expect(amount).toHaveAttribute("aria-describedby", "amount-help");
  await expect(
    page.getByRole("status").filter({ hasText: "Contract preview mode" }),
  ).toBeVisible();
  await expect(page.locator(".status-bar")).toBeVisible();

  let focusedControl: string | null = null;
  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.press("Tab");
    focusedControl = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement)) return null;
      if (el.id === "amount") return "amount";
      if (el.matches("button.connect-button")) return "connect";
      return null;
    });
    if (focusedControl) break;
  }
  expect(focusedControl).not.toBeNull();

  const outlineWidth = await page.evaluate(() => {
    const el = document.activeElement;
    return el instanceof HTMLElement ? getComputedStyle(el).outlineWidth : "0px";
  });
  expect(outlineWidth).not.toBe("0px");

  const durations = await page.evaluate(() => {
    const parseMs = (value: string) =>
      value.split(",").map((part) => {
        const trimmed = part.trim();
        if (trimmed.endsWith("ms")) return Number.parseFloat(trimmed);
        if (trimmed.endsWith("s")) return Number.parseFloat(trimmed) * 1000;
        return Number.NaN;
      });
    const connect = document.querySelector(".connect-button");
    const wave = document.querySelector(".pool-visual .wave");
    return {
      connect: connect ? parseMs(getComputedStyle(connect).transitionDuration) : [],
      wave: wave ? parseMs(getComputedStyle(wave).transitionDuration) : [],
    };
  });
  expect(durations.connect.length).toBeGreaterThan(0);
  expect(durations.wave.length).toBeGreaterThan(0);
  for (const ms of [...durations.connect, ...durations.wave]) {
    expect(ms).toBeLessThan(1);
  }
});
