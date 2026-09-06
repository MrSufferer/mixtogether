import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  keccak256,
  parseEther,
  toUtf8Bytes,
} from "ethers";
import { loadRepoEnv, DEFAULT_SEPOLIA_RPC_URL } from "./load-env";
import { OFFICIAL_SEPOLIA } from "./addresses";
import { encodeFundingMode, FUNDING_MODE_DEPOSIT } from "./smoke-sepolia";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

loadRepoEnv();

export const SLOT_DEPOSIT_AMOUNT = 1_000_000n; // 1 cUSDC

export function validateEightSlotConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const poolAddress = env.POOL_ADDRESS?.trim();
  if (!poolAddress) throw new Error("POOL_ADDRESS is required");

  const rawKey = env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!rawKey) throw new Error("DEPLOYER_PRIVATE_KEY is required");

  const deployerKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  const rpcUrl = env.SEPOLIA_RPC_URL?.trim() || DEFAULT_SEPOLIA_RPC_URL;

  return { poolAddress, deployerKey, rpcUrl };
}

export type SlotReceiptRecord = {
  operation: string;
  drawId: string;
  blockNumber: number;
  gasUsed: string;
  hash: string;
};

export function formatSlotReceipt(
  operation: string,
  data: { drawId: bigint; blockNumber: number; gasUsed: bigint; hash: string },
): SlotReceiptRecord {
  return {
    operation,
    drawId: data.drawId.toString(),
    blockNumber: data.blockNumber,
    gasUsed: data.gasUsed.toString(),
    hash: data.hash,
  };
}

const mockUsdcAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function mint(address,uint256)",
  "function approve(address,uint256) returns (bool)",
] as const;

const wrapperAbi = [
  "function wrap(address to, uint256 amount) returns (bytes32)",
  "function confidentialTransferAndCall(address to, bytes32 encryptedAmount, bytes inputProof, bytes data) returns (bytes32)",
] as const;

const poolAbi = [
  "function drawState() view returns (uint64 drawId,uint8 phase,uint48 epochStartedAt,uint48 cutoff,uint48 scheduledCutoff,uint8 accrualCursor,uint8 selectionCursor,uint8 registeredSavers)",
  "function slotOf(address) view returns (uint8)",
  "function exitRequested(address) view returns (bool)",
  "function closeDraw() external",
  "function processAccrualBatch() external",
  "function randomizeDraw() external",
  "function processSelectionBatch() external",
  "function withdrawAll() external",
  "function claimWinnings() external",
] as const;

function ethersMaxUint256(): bigint {
  return (1n << 256n) - 1n;
}

export async function advanceDrawToOpen(pool: Contract, provider: JsonRpcProvider) {
  let state = await pool.drawState();
  const latest = await provider.getBlock("latest");
  const now = latest?.timestamp ?? Math.floor(Date.now() / 1000);

  if (state.phase === 0n && BigInt(now) < state.scheduledCutoff) {
    console.log(`Pool is already in OPEN phase with ${Number(state.scheduledCutoff) - now}s remaining.`);
    return;
  }

  console.log(`Advancing pool from Draw ${state.drawId} (phase ${state.phase}) to a fresh OPEN draw...`);
  if (state.phase === 0n) {
    console.log("  Closing expired draw...");
    const tx = await pool.closeDraw({ gasLimit: 500_000n });
    await tx.wait();
  }

  state = await pool.drawState();
  if (state.phase === 1n) {
    console.log("  Processing accrual batch...");
    const tx = await pool.processAccrualBatch({ gasLimit: 2_000_000n });
    await tx.wait();
  }

  state = await pool.drawState();
  if (state.phase === 2n) {
    console.log("  Randomizing draw...");
    const tx = await pool.randomizeDraw({ gasLimit: 1_000_000n });
    await tx.wait();
  }

  state = await pool.drawState();
  if (state.phase === 3n) {
    console.log("  Processing selection batch to finalize...");
    const tx = await pool.processSelectionBatch({ gasLimit: 2_500_000n });
    await tx.wait();
  }

  state = await pool.drawState();
  console.log(`Fresh draw active: Draw ${state.drawId}, Phase: ${state.phase}, Cutoff: ${state.scheduledCutoff}`);
}

export async function runEightSlotSmoke() {
  const config = validateEightSlotConfig();
  console.log("=== MixTogether Sepolia Eight-Slot HCU + Two-Wallet Smoke ===");
  console.log("RPC:", config.rpcUrl);
  console.log("Target Pool:", config.poolAddress);

  const provider = new JsonRpcProvider(config.rpcUrl, 11155111);
  const deployer = new Wallet(config.deployerKey, provider);
  console.log("Deployer:", deployer.address);

  const pool = new Contract(config.poolAddress, poolAbi, deployer);

  // 1. Initialize 8 deterministic wallets
  const wallets: Wallet[] = [];
  for (let i = 0; i < 8; i++) {
    const subKey = keccak256(toUtf8Bytes(`${config.deployerKey}:saver:${i}`));
    const subWallet = new Wallet(subKey, provider);
    wallets.push(subWallet);
  }
  const alice = wallets[0];
  const bob = wallets[1];
  console.log("8 deterministic test saver wallets:");
  wallets.forEach((w, i) =>
    console.log(
      `  Saver ${i + 1} (${i === 0 ? "Alice" : i === 1 ? "Bob" : "Saver " + (i + 1)}): ${w.address}`,
    ),
  );

  // 2. Ensure each wallet has at least 0.01 ETH for gas
  console.log("Checking wallet gas balances...");
  for (let i = 0; i < 8; i++) {
    const w = wallets[i];
    const bal = await provider.getBalance(w.address);
    if (bal < parseEther("0.009")) {
      const topUp = parseEther("0.012") - bal;
      console.log(`  Topping up Saver ${i + 1} with ${formatEther(topUp)} ETH...`);
      const fundTx = await deployer.sendTransaction({ to: w.address, value: topUp });
      await fundTx.wait();
    }
  }

  // 3. Pre-flight tokens: Mint, Approve, and Wrap to cUSDC for each wallet
  console.log("Pre-wrapping cUSDC for all 8 wallets...");
  for (let i = 0; i < 8; i++) {
    const w = wallets[i];
    const wUnderlying = new Contract(OFFICIAL_SEPOLIA.underlyingUsdc, mockUsdcAbi, w);
    const wWrapper = new Contract(OFFICIAL_SEPOLIA.confidentialUsdc, wrapperAbi, w);

    const usdcBal: bigint = await wUnderlying.balanceOf(w.address);
    if (usdcBal < SLOT_DEPOSIT_AMOUNT) {
      console.log(`  Minting mock USDC for Saver ${i + 1}...`);
      const mintTx = await wUnderlying.mint(w.address, SLOT_DEPOSIT_AMOUNT);
      await mintTx.wait();
    }

    const allowance: bigint = await wUnderlying.allowance(w.address, OFFICIAL_SEPOLIA.confidentialUsdc);
    if (allowance < SLOT_DEPOSIT_AMOUNT) {
      console.log(`  Approving wrapper for Saver ${i + 1}...`);
      const approveTx = await wUnderlying.approve(OFFICIAL_SEPOLIA.confidentialUsdc, ethersMaxUint256());
      await approveTx.wait();
    }

    if (usdcBal >= SLOT_DEPOSIT_AMOUNT) {
      console.log(`  Wrapping 1 cUSDC for Saver ${i + 1}...`);
      const wrapTx = await wWrapper.wrap(w.address, SLOT_DEPOSIT_AMOUNT);
      await wrapTx.wait();
    }
  }

  // 4. Pre-generate encrypted input proofs via Zama SDK
  console.log("Pre-generating encrypted input proofs with Zama FHEVM SDK...");
  const fhevm = await createInstance({
    ...SepoliaConfig,
    network: config.rpcUrl,
  });

  const proofs: { handles: Uint8Array[]; inputProof: Uint8Array }[] = [];
  for (let i = 0; i < 8; i++) {
    const w = wallets[i];
    console.log(`  Generating proof ${i + 1}/8 for ${w.address}...`);
    const input = await fhevm
      .createEncryptedInput(OFFICIAL_SEPOLIA.confidentialUsdc, w.address)
      .add64(SLOT_DEPOSIT_AMOUNT)
      .encrypt();
    proofs.push(input as any);
  }

  // 5. Ensure pool is in a fresh OPEN draw with full epoch remaining
  await advanceDrawToOpen(pool, provider);

  // 6. Broadcast all 8 deposits into the pool
  let state = await pool.drawState();
  console.log(`Submitting 8 deposits into Draw ${state.drawId} (registeredSavers: ${state.registeredSavers})...`);

  for (let i = 0; i < 8; i++) {
    const w = wallets[i];
    const wWrapper = new Contract(OFFICIAL_SEPOLIA.confidentialUsdc, wrapperAbi, w);
    const input = proofs[i];

    const depositTx = await wWrapper.confidentialTransferAndCall(
      config.poolAddress,
      input.handles[0],
      input.inputProof,
      encodeFundingMode(FUNDING_MODE_DEPOSIT),
      { gasLimit: 2_500_000n },
    );
    const rc = await depositTx.wait();
    console.log(`  [Slot ${i + 1}/8] Saver ${w.address} deposited in tx ${rc.hash} (block ${rc.blockNumber})`);
  }

  state = await pool.drawState();
  console.log(`Pool registered savers: ${state.registeredSavers} / 64`);
  if (state.registeredSavers < 8) {
    throw new Error(`Expected at least 8 registered savers, got ${state.registeredSavers}`);
  }

  // 7. Wait for scheduled cutoff
  console.log(`Waiting for scheduled cutoff ${state.scheduledCutoff}...`);
  let latest = await provider.getBlock("latest");
  while (latest && BigInt(latest.timestamp) < state.scheduledCutoff) {
    const remaining = Number(state.scheduledCutoff) - latest.timestamp;
    console.log(`  Draw ${state.drawId} open; ${remaining}s remaining until cutoff...`);
    const { promise, resolve } = (Promise as any).withResolvers();
    setTimeout(resolve, 15_000);
    await promise;
    latest = await provider.getBlock("latest");
  }

  // 8. Execute draw state transitions & collect HCU receipts
  console.log("=== Advancing Draw Machine: HCU Accrual & Selection ===");

  // Phase 0 -> 1: closeDraw
  console.log("Calling closeDraw()...");
  const closeTx = await pool.closeDraw({ gasLimit: 500_000n });
  const closeReceipt = await closeTx.wait();
  console.log(`closeDraw confirmed in block ${closeReceipt.blockNumber}, gasUsed: ${closeReceipt.gasUsed}`);

  // Phase 1 -> 2: processAccrualBatch (processes all 8 occupied slots)
  console.log("Calling processAccrualBatch() for 8 occupied slots (Live HCU Accrual)...");
  const accrueTx = await pool.processAccrualBatch({ gasLimit: 2_500_000n });
  const accrueReceipt = await accrueTx.wait();
  const accrualRecord = formatSlotReceipt("processAccrualBatch (8 slots)", {
    drawId: state.drawId,
    blockNumber: accrueReceipt.blockNumber,
    gasUsed: accrueReceipt.gasUsed,
    hash: accrueReceipt.hash,
  });
  console.log("Live 8-Slot Accrual Receipt:", JSON.stringify(accrualRecord, null, 2));

  // Phase 2 -> 3: randomizeDraw
  console.log("Calling randomizeDraw()...");
  const randTx = await pool.randomizeDraw({ gasLimit: 1_000_000n });
  const randReceipt = await randTx.wait();
  console.log(`randomizeDraw confirmed in block ${randReceipt.blockNumber}, gasUsed: ${randReceipt.gasUsed}`);

  // Phase 3 -> 0: processSelectionBatch (processes all 8 occupied slots + selection)
  console.log("Calling processSelectionBatch() for 8 occupied slots (Live HCU Selection)...");
  const selectTx = await pool.processSelectionBatch({ gasLimit: 3_000_000n });
  const selectReceipt = await selectTx.wait();
  const selectionRecord = formatSlotReceipt("processSelectionBatch (8 slots)", {
    drawId: state.drawId,
    blockNumber: selectReceipt.blockNumber,
    gasUsed: selectReceipt.gasUsed,
    hash: selectReceipt.hash,
  });
  console.log("Live 8-Slot Selection Receipt:", JSON.stringify(selectionRecord, null, 2));

  // 9. Two-wallet walkthrough verification
  console.log("=== Two-Wallet Walkthrough Checks ===");
  const alicePool = new Contract(config.poolAddress, poolAbi, alice);
  const bobPool = new Contract(config.poolAddress, poolAbi, bob);

  const aliceSlot = await pool.slotOf(alice.address);
  const bobSlot = await pool.slotOf(bob.address);
  console.log(`Alice slot: ${aliceSlot}, Bob slot: ${bobSlot}`);

  // Alice & Bob submit confidential claim transactions
  console.log("Alice submitting claim transaction...");
  const aliceClaimTx = await alicePool.claimWinnings({ gasLimit: 1_000_000n });
  const aliceClaimReceipt = await aliceClaimTx.wait();
  console.log(`Alice claim confirmed in block ${aliceClaimReceipt.blockNumber} (tx ${aliceClaimReceipt.hash})`);

  console.log("Bob submitting claim transaction...");
  const bobClaimTx = await bobPool.claimWinnings({ gasLimit: 1_000_000n });
  const bobClaimReceipt = await bobClaimTx.wait();
  console.log(`Bob claim confirmed in block ${bobClaimReceipt.blockNumber} (tx ${bobClaimReceipt.hash})`);

  // Alice withdraws all principal
  console.log("Alice withdrawing principal...");
  const aliceWithdrawTx = await alicePool.withdrawAll({ gasLimit: 1_500_000n });
  const aliceWithdrawReceipt = await aliceWithdrawTx.wait();
  console.log(`Alice withdrawal confirmed in block ${aliceWithdrawReceipt.blockNumber} (tx ${aliceWithdrawReceipt.hash})`);

  const aliceExited = await pool.exitRequested(alice.address);
  console.log(`Alice exit requested status: ${aliceExited}`);

  console.log("=== Sepolia Eight-Slot HCU + Two-Wallet Smoke Complete ===");
  return {
    accrualRecord,
    selectionRecord,
    aliceSlot: Number(aliceSlot),
    bobSlot: Number(bobSlot),
  };
}

if (process.argv[1]?.endsWith("smoke-eight-slots.ts")) {
  runEightSlotSmoke().catch((err) => {
    console.error("Eight-slot smoke failed:", err);
    process.exitCode = 1;
  });
}
