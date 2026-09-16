/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHROUDLY_ENVIRONMENT?: "preprod";
  readonly VITE_SHROUDLY_NETWORK_ID?: "preprod";
  readonly VITE_SHROUDLY_DEPLOYMENT_ID?: string;
  readonly VITE_SHROUDLY_ASSET_CONTRACT_ID?: string;
  readonly VITE_SHROUDLY_RANDOMNESS_CONTRACT_ID?: string;
  readonly VITE_SHROUDLY_YIELD_CONTRACT_ID?: string;
  readonly VITE_SHROUDLY_POOL_CONTRACT_ID?: string;
  readonly VITE_SHROUDLY_INDEXER_URL?: string;
  readonly VITE_SHROUDLY_RPC_URL?: string;
  readonly VITE_SHROUDLY_ZK_CONFIG_URL?: string;
  readonly VITE_SHROUDLY_SPONSOR_URL?: string;
  readonly VITE_SHROUDLY_BUILD_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  readonly midnight?: Record<string, unknown>;
}
