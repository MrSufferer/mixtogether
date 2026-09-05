import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

export const DEFAULT_SEPOLIA_RPC_URL =
  "https://ethereum-sepolia-rpc.publicnode.com";

export type SepoliaConfig = {
  accounts: string[];
  url: string;
  etherscanApiKey: string;
};

/**
 * Loads repo-root .env explicitly into process.env if present.
 * Does not overwrite existing environment variables.
 */
export function loadRepoEnv(options?: { repoRoot?: string }): dotenv.DotenvConfigOutput {
  const root = options?.repoRoot ?? resolve(__dirname, "../../..");
  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) {
    return dotenv.config({ path: envPath });
  }
  return { parsed: {} };
}

/**
 * Resolves Sepolia network configuration fail-closed:
 * - Empty accounts if DEPLOYER_PRIVATE_KEY is missing or empty
 * - Never uses a default or mnemonic on Sepolia
 * - Uses SEPOLIA_RPC_URL or INFURA_API_KEY if provided, falling back to public RPC
 * - Reads ETHERSCAN_API_KEY from env
 * - Optional varsFallback for non-secret vars (e.g. from hardhat vars)
 */
export function resolveSepoliaConfig(
  env: Record<string, string | undefined> = process.env,
  varsFallback?: (key: string, defaultValue?: string) => string,
): SepoliaConfig {
  const rawKey = env.DEPLOYER_PRIVATE_KEY?.trim();
  const accounts: string[] = rawKey ? [rawKey] : [];

  let url = env.SEPOLIA_RPC_URL?.trim();
  if (!url && env.INFURA_API_KEY?.trim()) {
    url = `https://sepolia.infura.io/v3/${env.INFURA_API_KEY.trim()}`;
  }
  if (!url && varsFallback) {
    const varsUrl = varsFallback("SEPOLIA_RPC_URL", "").trim();
    if (varsUrl) {
      url = varsUrl;
    } else {
      const varsInfura = varsFallback("INFURA_API_KEY", "").trim();
      if (varsInfura) {
        url = `https://sepolia.infura.io/v3/${varsInfura}`;
      }
    }
  }
  if (!url) {
    url = DEFAULT_SEPOLIA_RPC_URL;
  }

  let etherscanApiKey = env.ETHERSCAN_API_KEY?.trim() ?? "";
  if (!etherscanApiKey && varsFallback) {
    etherscanApiKey = varsFallback("ETHERSCAN_API_KEY", "").trim();
  }

  return {
    accounts,
    url,
    etherscanApiKey,
  };
}
