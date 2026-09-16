import { MemoryPrivateStateStore } from "./private-state";
import { createMidnightProviderBoundaries } from "./providers";
import { MIDNIGHT_NETWORK_CONFIG } from "./config";

// Package adapters are intentionally injected here. The UI can be built and
// tested without pretending that a wallet, indexer, or proof server is live.
export const MIDNIGHT_PROVIDER_BOUNDARIES = createMidnightProviderBoundaries(
  {
    network: MIDNIGHT_NETWORK_CONFIG.network,
    rpcUrl: MIDNIGHT_NETWORK_CONFIG.rpcUrl,
    indexerGraphqlUrl: MIDNIGHT_NETWORK_CONFIG.indexerGraphqlUrl,
    zkConfigUrl: MIDNIGHT_NETWORK_CONFIG.zkConfigUrl,
    proofMode: MIDNIGHT_NETWORK_CONFIG.proofMode,
    allowRemoteProof: MIDNIGHT_NETWORK_CONFIG.allowRemoteProof,
  },
  { privateState: new MemoryPrivateStateStore<unknown>() },
);
