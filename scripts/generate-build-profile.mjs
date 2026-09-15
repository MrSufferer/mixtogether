import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputFlag = process.argv.indexOf("--out");
const outputArg = outputFlag >= 0 ? process.argv[outputFlag + 1] : "apps/web/public/build-profile.json";
if (!outputArg || outputArg.startsWith("-")) throw new Error("--out requires a file path");
const output = resolve(root, outputArg);
const sourceNames = ["TmixAsset", "RandomnessThreshold", "YieldAdapter", "PrizePool"];
const artifactHashes = sourceNames.map((name) => `0x${createHash("sha256").update(readFileSync(resolve(root, "midnight", `${name}.compact`))).digest("hex")}`);
const env = process.env;
const constants = {
  token: "tMIX",
  tokenDecimals: 6,
  supplyCapMicroUnits: "10000000000000",
  faucetAmountMicroUnits: "1000000000",
  faucetEpochSeconds: "86400",
  automationAllocationMicroUnits: "25000000000",
  initialPrizeReserveMicroUnits: "1000000000000",
  simulatedYieldPerDrawMicroUnits: "100000000",
  simulatedYieldIntervalSeconds: "900",
  contributionMinMicroUnits: "1000000",
  contributionMaxMicroUnits: "1000000000",
  prizeReplenishmentMaxMicroUnits: "1000000000000",
  prizeReplenishmentTimelockSeconds: "3600",
  disclosureCohort: 5,
  randomnessContributors: 3,
  randomnessThreshold: 2,
  claimWindowSeconds: "3600",
  fullSettlementPauseMaxSeconds: "86400",
  sponsorTimeoutMilliseconds: 8000,
  sponsoredActionsPerAccountPer24h: 20,
  sponsoredActionsGlobalPerUtcDay: 500,
  sponsorDustCap: "125% of max observed qualification cost",
};
const profile = {
  product: "Shroudly",
  environment: "preprod",
  networkId: "preprod",
  deploymentId: env.VITE_SHROUDLY_DEPLOYMENT_ID || "shroudly-preprod-unassigned",
  contractIds: {
    asset: env.VITE_SHROUDLY_ASSET_CONTRACT_ID || "unassigned",
    randomness: env.VITE_SHROUDLY_RANDOMNESS_CONTRACT_ID || "unassigned",
    yield: env.VITE_SHROUDLY_YIELD_CONTRACT_ID || "unassigned",
    pool: env.VITE_SHROUDLY_POOL_CONTRACT_ID || "unassigned",
  },
  artifactHashes,
  endpoints: {
    rpc: env.VITE_SHROUDLY_RPC_URL || "https://rpc.preprod.midnight.network",
    indexer: env.VITE_SHROUDLY_INDEXER_URL || "https://indexer.preprod.midnight.network/api/v4/graphql",
    zkConfig: env.VITE_SHROUDLY_ZK_CONFIG_URL || "",
    sponsor: env.VITE_SHROUDLY_SPONSOR_URL || "",
  },
  compatibility: {
    compactLanguage: "0.5.1",
    compactCompiler: "0.31.1",
    compactRuntime: "0.16.0",
    midnightJs: "4.1.1",
    walletSdk: "1.2.0",
    dappConnector: "4.0.1",
    node: "1.0.2",
    indexer: "4.3.3-hotfix",
    proofServer: "8.1.0",
  },
  constants,
  governance: "two-of-three-preprod",
  deployerDeadlineSeconds: "86400",
  mainnetTransactionsEnabled: false,
};
profile.snapshotHash = `0x${createHash("sha256").update(JSON.stringify(profile)).digest("hex")}`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o644 });
console.log(`Wrote sanitized Shroudly build profile to ${output.replace(`${root}/`, "")}`);
