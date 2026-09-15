/**
 * Contract package metadata. The executable contracts are Compact sources in
 * /midnight; this package deliberately has no legacy chain toolchain or deployer.
 */
export const CONTRACT_COMPONENTS = [
  "TmixAsset",
  "RandomnessThreshold",
  "YieldAdapter",
  "PrizePool",
] as const;

export type ContractComponent = (typeof CONTRACT_COMPONENTS)[number];

export const COMPACT_PROFILE = Object.freeze({
  language: "0.5.1",
  compiler: "0.31.1",
  runtime: "0.16.0",
  midnightJs: "4.1.1",
  dappConnector: "4.0.1",
  walletSdk: "1.2.0",
  node: "1.0.2",
  indexer: "4.3.3-hotfix",
  proofServer: "8.1.0",
});
