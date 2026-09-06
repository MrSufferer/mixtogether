import { AbiCoder, Contract, JsonRpcProvider, Wallet } from "ethers";
import { loadRepoEnv, DEFAULT_SEPOLIA_RPC_URL } from "./load-env";
import { OFFICIAL_SEPOLIA } from "./addresses";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

loadRepoEnv();

export const FUNDING_MODE_DEPOSIT = 1 as const;
export const FUNDING_MODE_PRIZE = 2 as const;

export function encodeFundingMode(mode: 1 | 2): string {
  return AbiCoder.defaultAbiCoder().encode(["uint8"], [mode]);
}

export function validateSmokeConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const poolAddress = env.POOL_ADDRESS?.trim();
  if (!poolAddress) {
    throw new Error("POOL_ADDRESS is required");
  }

  const rawKey = env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!rawKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required");
  }

  const deployerKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  const rpcUrl = env.SEPOLIA_RPC_URL?.trim() || DEFAULT_SEPOLIA_RPC_URL;

  return {
    poolAddress,
    deployerKey,
    rpcUrl,
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
  "function registeredSavers() view returns (uint8)",
] as const;

async function main() {
  const config = validateSmokeConfig();
  console.log("Connecting to Sepolia via:", config.rpcUrl);
  const provider = new JsonRpcProvider(config.rpcUrl, 11155111);
  const wallet = new Wallet(config.deployerKey, provider);
  console.log("Operator address:", wallet.address);
  console.log("Target pool:", config.poolAddress);

  const ONE_USDC = 1_000_000n;
  const FUND_AMOUNT = 100n * ONE_USDC; // 100 cUSDC

  const underlying = new Contract(OFFICIAL_SEPOLIA.underlyingUsdc, mockUsdcAbi, wallet);
  const wrapper = new Contract(OFFICIAL_SEPOLIA.confidentialUsdc, wrapperAbi, wallet);
  const pool = new Contract(config.poolAddress, poolAbi, wallet);

  // 1. Check underlying balance and mint if needed
  const usdcBal: bigint = await underlying.balanceOf(wallet.address);
  console.log(`Current mock USDC balance: ${Number(usdcBal) / 1e6} USDC`);
  if (usdcBal < FUND_AMOUNT) {
    const mintAmount = FUND_AMOUNT - usdcBal;
    console.log(`Minting ${Number(mintAmount) / 1e6} mock USDC from faucet...`);
    const mintTx = await underlying.mint(wallet.address, mintAmount);
    console.log(`Mint tx submitted: ${mintTx.hash}`);
    await mintTx.wait();
    console.log("Mint confirmed.");
  }

  // 2. Approve wrapper
  const allowance: bigint = await underlying.allowance(wallet.address, OFFICIAL_SEPOLIA.confidentialUsdc);
  if (allowance < FUND_AMOUNT) {
    console.log("Approving cUSDC wrapper contract...");
    const approveTx = await underlying.approve(OFFICIAL_SEPOLIA.confidentialUsdc, ethersMaxUint256());
    console.log(`Approve tx submitted: ${approveTx.hash}`);
    await approveTx.wait();
    console.log("Approval confirmed.");
  }

  // 3. Wrap USDC into cUSDC
  console.log(`Wrapping ${Number(FUND_AMOUNT) / 1e6} USDC into confidential cUSDC...`);
  const wrapTx = await wrapper.wrap(wallet.address, FUND_AMOUNT);
  console.log(`Wrap tx submitted: ${wrapTx.hash}`);
  await wrapTx.wait();
  console.log("Wrap confirmed.");

  // 4. Create encrypted input proof via Zama relayer SDK
  console.log("Initializing Zama FHEVM SDK instance...");
  const fhevm = await createInstance({
    ...SepoliaConfig,
    network: config.rpcUrl,
  });

  console.log("Generating encrypted input proof for 100 cUSDC prize funding...");
  const encryptedInput = await fhevm
    .createEncryptedInput(OFFICIAL_SEPOLIA.confidentialUsdc, wallet.address)
    .add64(FUND_AMOUNT)
    .encrypt();

  // 5. Fund prize reserve via confidentialTransferAndCall with mode 2 (PRIZE)
  console.log("Calling confidentialTransferAndCall with funding mode 2 (PRIZE)...");
  const transferTx = await wrapper.confidentialTransferAndCall(
    config.poolAddress,
    encryptedInput.handles[0],
    encryptedInput.inputProof,
    encodeFundingMode(FUNDING_MODE_PRIZE),
  );
  console.log(`Funding tx submitted: ${transferTx.hash}`);
  const receipt = await transferTx.wait();
  console.log(`Funding confirmed in block ${receipt.blockNumber}! Gas used: ${receipt.gasUsed}`);

  // 6. Check final pool draw state
  const state = await pool.drawState();
  console.log("Final pool draw state:", {
    drawId: state.drawId.toString(),
    phase: state.phase.toString(),
    registeredSavers: state.registeredSavers.toString(),
    scheduledCutoff: state.scheduledCutoff.toString(),
  });
}

function ethersMaxUint256(): bigint {
  return (1n << 256n) - 1n;
}

if (process.argv[1]?.endsWith("smoke-sepolia.ts")) {
  main().catch((error: unknown) => {
    console.error("Smoke test failed:", error);
    process.exitCode = 1;
  });
}
