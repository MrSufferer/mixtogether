import { createConfig, custom } from "wagmi";
import { sepolia } from "wagmi/chains";
import { mock } from "wagmi/connectors/mock";
import type { Address } from "viem";
import { e2eEthereumProvider } from "../test/e2e/chain";
import { MOCK_ACCOUNT } from "../test/e2e/pool-store";

export const CHAIN_ID = 11_155_111;
export const CUSDC_ADDRESS = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as Address;
export const USDC_ADDRESS = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF" as Address;
export const REGISTRY_ADDRESS = "0x2f0750Bbb0A246059d80e94c454586a7F27a128e" as Address;

export const POOL_CONFIGURED = true;
export const POOL_ADDRESS = (import.meta.env.VITE_POOL_ADDRESS ||
  "0x1111111111111111111111111111111111111111") as Address;

const isInitiallyConnected =
  typeof window !== "undefined" &&
  (window.sessionStorage.getItem("__mixtogether_mock_connected__") === "true" ||
    Boolean(
      window.localStorage.getItem(
        `mixtogether:pending-unwraps:${MOCK_ACCOUNT}`,
      ),
    ));

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [
    mock({
      accounts: [MOCK_ACCOUNT],
      features: {
        defaultConnected: isInitiallyConnected,
        reconnect: true,
      },
    }),
  ],
  transports: {
    [sepolia.id]: custom(e2eEthereumProvider),
  },
  batch: {
    multicall: false,
  },
  ssr: false,
});

export const zamaConfig = {};
