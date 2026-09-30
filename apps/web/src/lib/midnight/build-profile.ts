import { hashText, type Hex } from "./hashing";
import { MIDNIGHT_NETWORK_CONFIG, MIDNIGHT_QUALIFICATION_VERIFIER_FINGERPRINT, MIDNIGHT_VERSION_PROFILE } from "./config";
import { PROGRAM_CONSTANTS, MAINNET_INTERFACE } from "./constants";
import { SHROUDLY_ARTIFACT_HASHES } from "./artifact-hashes";

export type SanitizedBuildProfile = Readonly<{
  product: "Shroudly";
  environment: "preprod";
  networkId: "preprod";
  deploymentId: string;
  contractIds: Readonly<Record<"asset" | "randomness" | "yield" | "pool", string>>;
  artifactHashes: readonly Hex[];
  endpoints: Readonly<{ rpc: string; indexer: string; zkConfig: string; sponsor: string }>;
  compatibility: typeof MIDNIGHT_VERSION_PROFILE;
  constants: Readonly<Record<string, string | number>>;
  governance: "two-of-three-preprod";
  qualificationVerifierFingerprint: string | null;
  mainnetTransactionsEnabled: false;
  snapshotHash: Hex;
}>;

const env = import.meta.env;
const constants: Record<string, string | number> = Object.fromEntries(Object.entries(PROGRAM_CONSTANTS).filter(([key]) => key.endsWith("MicroUnits") || key.endsWith("Seconds") || typeof PROGRAM_CONSTANTS[key as keyof typeof PROGRAM_CONSTANTS] === "number").map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value as number]));

export function createSanitizedBuildProfile(): SanitizedBuildProfile {
  const configuredHashes = [env.VITE_SHROUDLY_ASSET_ARTIFACT_HASH, env.VITE_SHROUDLY_RANDOMNESS_ARTIFACT_HASH, env.VITE_SHROUDLY_YIELD_ARTIFACT_HASH, env.VITE_SHROUDLY_POOL_ARTIFACT_HASH].filter((value): value is Hex => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value));
  const base = { product: "Shroudly" as const, environment: "preprod" as const, networkId: "preprod" as const, deploymentId: MIDNIGHT_NETWORK_CONFIG.deploymentId, contractIds: MIDNIGHT_NETWORK_CONFIG.contractIds, artifactHashes: (configuredHashes.length === 4 ? configuredHashes : SHROUDLY_ARTIFACT_HASHES) as readonly Hex[], endpoints: { rpc: MIDNIGHT_NETWORK_CONFIG.rpcUrl, indexer: MIDNIGHT_NETWORK_CONFIG.indexerGraphqlUrl, zkConfig: MIDNIGHT_NETWORK_CONFIG.zkConfigUrl, sponsor: MIDNIGHT_NETWORK_CONFIG.sponsorUrl }, compatibility: MIDNIGHT_VERSION_PROFILE, constants, governance: "two-of-three-preprod" as const, qualificationVerifierFingerprint: MIDNIGHT_QUALIFICATION_VERIFIER_FINGERPRINT, mainnetTransactionsEnabled: false as const };
  const snapshotHash = hashText(JSON.stringify(base));
  return Object.freeze({ ...base, snapshotHash });
}

export const SANITIZED_BUILD_PROFILE = createSanitizedBuildProfile();
export { MAINNET_INTERFACE };
