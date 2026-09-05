import { expect, test } from "@playwright/test";

test("walks the connected saver journey from mint to finalized cash-out", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/");

  // 1. Initial view: no preview banner on configured pool
  await expect(page).toHaveTitle(/MixTogether/);
  await expect(page.locator(".deployment-banner")).toHaveCount(0);

  // 2. Connect mock wallet
  const connectButton = page.getByRole("button", { name: "Connect wallet" });
  await expect(connectButton).toBeVisible();
  await connectButton.click();

  // Short address visible after connect
  await expect(page.getByText(/0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/)).toBeVisible();

  // 3. Faucet: Mint 100 USDC
  const mintButton = page.getByRole("button", { name: "Mint 100" });
  await expect(mintButton).toBeEnabled();
  await mintButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Minting 100 mock USDC confirmed\.|confirmed/,
  );

  // 4. Approve exact amount
  const approveButton = page.getByRole("button", { name: "Approve" });
  await expect(approveButton).toBeEnabled();
  await approveButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Approving the exact public amount confirmed\.|confirmed/,
  );

  // 5. Shield into cUSDC
  const shieldButton = page.getByRole("button", { name: "Shield" });
  await expect(shieldButton).toBeEnabled();
  await shieldButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Shielding into cUSDC confirmed\.|confirmed/,
  );

  // 6. Save privately (Deposit)
  const depositButton = page.getByRole("button", { name: "Deposit" });
  await expect(depositButton).toBeEnabled();
  await depositButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Adding private savings confirmed\.|confirmed/,
  );

  // Pool saver count updates to 1 / 64 savers
  await expect(page.getByText("1 / 64 savers")).toBeVisible();

  // 7. Reveal private balances
  const revealButton = page.getByRole("button", {
    name: /Reveal my private balances/,
  });
  await expect(revealButton).toBeVisible();
  await revealButton.click();

  // Saving principal shows a non-placeholder value (not "—")
  const principalBalance = page.getByText("Saving principal").locator("..");
  await expect(principalBalance).toBeVisible();
  await expect(principalBalance).not.toContainText("—");

  // 8. Close saving epoch and process draw
  const closeButton = page.getByRole("button", { name: /Close saving epoch/ });
  await expect(closeButton).toBeEnabled();
  await closeButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Close saving epoch confirmed\.|confirmed/,
  );

  const chanceBatchButton = page.getByRole("button", {
    name: /Process chance batch/,
  });
  await expect(chanceBatchButton).toBeEnabled();
  await chanceBatchButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Process chance batch confirmed\.|confirmed/,
  );

  const ticketButton = page.getByRole("button", {
    name: /Create private ticket/,
  });
  await expect(ticketButton).toBeEnabled();
  await ticketButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Create private ticket confirmed\.|confirmed/,
  );

  const selectionBatchButton = page.getByRole("button", {
    name: /Process selection batch/,
  });
  await expect(selectionBatchButton).toBeEnabled();
  await selectionBatchButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Process selection batch confirmed\.|confirmed/,
  );

  // Draw #1 history shows "Confidential outcome"
  const historyPanel = page.getByRole("article", {
    name: "Recent draw history",
  });
  await expect(historyPanel).toContainText("Draw #1");
  await expect(historyPanel).toContainText("Confidential outcome");

  // 9. Claim private winnings and withdraw principal
  const claimButton = page.getByRole("button", {
    name: "Claim private winnings",
  });
  await expect(claimButton).toBeEnabled();
  await claimButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Claim Winnings confirmed\.|confirmed/,
  );

  const withdrawButton = page.getByRole("button", {
    name: "Withdraw all principal",
  });
  await expect(withdrawButton).toBeEnabled();
  await withdrawButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Withdraw All confirmed\.|confirmed/,
  );

  // 10. Request public cash-out (unwrap)
  const unwrapButton = page.getByRole("button", {
    name: "Request public cash-out",
  });
  await expect(unwrapButton).toBeEnabled();
  await unwrapButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Requesting public cash-out confirmed\.|confirmed/,
  );

  // 11. Reload page and check resume of pending unwrap
  await page.reload();

  const finalizeButton = page.getByRole("button", {
    name: /Finalize 0x[0-9a-fA-F]{6}…[0-9a-fA-F]{4}/,
  });
  await expect(finalizeButton).toBeVisible();
  await finalizeButton.click();
  await expect(page.getByRole("status")).toContainText(
    /Finalizing public cash-out confirmed\.|confirmed/,
  );

  // Pending button should disappear after finalization
  await expect(finalizeButton).toHaveCount(0);

  // Viewport width invariant for mobile
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  // No unhandled page errors
  expect(pageErrors).toEqual([]);
});
