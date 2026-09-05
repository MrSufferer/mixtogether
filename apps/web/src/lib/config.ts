import { indexedDBStorage } from "@zama-fhe/sdk";
import { sepolia as fheSepolia } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { injected } from "wagmi/connectors";
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import type { Address } from "viem";
import { isAddress, zeroAddress } from "viem";
import { SessionCredentialStorage } from "./session-storage";

export const CHAIN_ID = 11_155_111;
export const CUSDC_ADDRESS = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as Address;
export const USDC_ADDRESS = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF" as Address;
export const REGISTRY_ADDRESS = "0x2f0750Bbb0A246059d80e94c454586a7F27a128e" as Address;

const configuredPool = import.meta.env.VITE_POOL_ADDRESS;
export const POOL_CONFIGURED = Boolean(configuredPool && isAddress(configuredPool));
export const POOL_ADDRESS = POOL_CONFIGURED ? configuredPool as Address : zeroAddress;

const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL || fheSepolia.network;

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [sepolia.id]: http(rpcUrl) },
  ssr: false,
});

const permitStorage = typeof window === "undefined" ? undefined : new SessionCredentialStorage();

export const zamaConfig = createZamaConfig({
  chains: [{ ...fheSepolia, network: rpcUrl }],
  wagmiConfig,
  relayers: { [fheSepolia.id]: web() },
  storage: indexedDBStorage,
  permitStorage,
  permitTTL: 1,
});
