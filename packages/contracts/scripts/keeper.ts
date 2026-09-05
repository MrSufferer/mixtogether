import { Contract, JsonRpcProvider, Wallet } from "ethers";

const keeperAbi = [
  "function drawState() view returns (uint64 drawId,uint8 phase,uint48 epochStartedAt,uint48 cutoff,uint48 scheduledCutoff,uint8 accrualCursor,uint8 selectionCursor,uint8 registeredSavers)",
  "function closeDraw()",
  "function processAccrualBatch()",
  "function randomizeDraw()",
  "function processSelectionBatch()",
] as const;

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.KEEPER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
const poolAddress = process.env.POOL_ADDRESS;
const watch = process.argv.includes("--watch");

if (!rpcUrl || !privateKey || !poolAddress) {
  throw new Error(
    "SEPOLIA_RPC_URL, POOL_ADDRESS, and KEEPER_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) are required",
  );
}

const provider = new JsonRpcProvider(rpcUrl, 11_155_111, { staticNetwork: true });
const keeper = new Wallet(privateKey, provider);
const pool = new Contract(poolAddress, keeperAbi, keeper);

async function advanceOnce() {
  const state = await pool.drawState();
  const latest = await provider.getBlock("latest");
  if (!latest) throw new Error("Latest block unavailable");

  let transaction;
  if (state.phase === 0n) {
    if (BigInt(latest.timestamp) < state.scheduledCutoff) {
      console.log(`Draw ${state.drawId} remains open until ${state.scheduledCutoff}`);
      return;
    }
    transaction = await pool.closeDraw();
  } else if (state.phase === 1n) {
    transaction = await pool.processAccrualBatch();
  } else if (state.phase === 2n) {
    transaction = await pool.randomizeDraw();
  } else {
    transaction = await pool.processSelectionBatch();
  }

  console.log(`Submitted ${transaction.hash}`);
  const receipt = await transaction.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);
}

async function main() {
  do {
    try {
      await advanceOnce();
    } catch (error) {
      console.error(error);
      if (!watch) throw error;
    }
    if (watch) await new Promise((resolve) => setTimeout(resolve, 12_000));
  } while (watch);
}

main().catch(() => {
  process.exitCode = 1;
});
