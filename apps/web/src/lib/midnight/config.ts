import { createMigrationTimeline } from "./timeline";
import { PROGRAM_CONSTANTS, MAINNET_INTERFACE } from "./constants";

export const SHROUDLY_ENVIRONMENT = "preprod" as const;
export const SHROUDLY_NETWORK_ID = "preprod" as const;

export const MIDNIGHT_NETWORK_CONFIG = Object.freeze({
  environment: SHROUDLY_ENVIRONMENT,
  network: SHROUDLY_NETWORK_ID,
  deploymentId: import.meta.env.VITE_SHROUDLY_DEPLOYMENT_ID ?? "shroudly-preprod-unassigned",
  rpcUrl: import.meta.env.VITE_SHROUDLY_RPC_URL ?? "https://rpc.preprod.midnight.network",
  indexerGraphqlUrl: import.meta.env.VITE_SHROUDLY_INDEXER_URL ?? "https://indexer.preprod.midnight.network/api/v4/graphql",
  zkConfigUrl: import.meta.env.VITE_SHROUDLY_ZK_CONFIG_URL ?? "",
  sponsorUrl: import.meta.env.VITE_SHROUDLY_SPONSOR_URL ?? "",
  proofMode: "local" as const,
  allowRemoteProof: false as const,
  mainnetTransactionsEnabled: false as const,
});

export const MIDNIGHT_VERSION_PROFILE = Object.freeze({
  compactCli: "0.5.2",
  compactLanguage: "0.23.0",
  compactCompiler: "0.31.1",
  compactRuntime: "0.16.0",
  midnightJs: "4.1.1",
  dappConnector: "4.0.1",
  walletSdk: "1.2.0",
  node: "1.0.2",
  indexer: "4.3.3-hotfix",
  proofServer: "8.1.0",
});

export const MIDNIGHT_PROVIDER_STATUS = [
  ["Private state", "Encrypted locally with Recovery Kit"],
  ["Proofs", "Official local proof provider"],
  ["Public data", "Indexer plus fresh ledger confirmation"],
  ["DUST", "Explicit sponsorship approval"],
] as const;

export const PREPROD_DISCLOSURES = Object.freeze({
  identity: "Shroudly Preprod / mainnet-test-build",
  trust: "Preprod is valueless test infrastructure and is not a Mainnet trust claim.",
  deployer: "Temporary deployer authority expires after 24 hours; submissions lock if removal is late.",
  governance: "Preprod governance and emergency actions require two of three authorities.",
  cohort: "Disclosure Cohort: five participating wallets are required before a draw can settle.",
  yield: "Simulated Yield: at most 100 tMIX per completed 15-minute draw.",
  token: "tMIX has six-decimal integer accounting and no monetary value.",
});

export const EMPTY_MIGRATION_TIMELINE = createMigrationTimeline({ id: "unconnected-account", network: SHROUDLY_NETWORK_ID, account: "unconnected" });

export { PROGRAM_CONSTANTS, MAINNET_INTERFACE };
