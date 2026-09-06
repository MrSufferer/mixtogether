import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "solidity-coverage";

import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";
import { loadRepoEnv, resolveSepoliaConfig } from "./scripts/load-env";

loadRepoEnv();

const mnemonic = vars.get(
  "MNEMONIC",
  "test test test test test test test test test test test junk",
);
const sepolia = resolveSepoliaConfig(process.env, vars.get.bind(vars));
const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  etherscan: {
    apiKey: { sepolia: sepolia.etherscanApiKey },
  },
  networks: {
    hardhat: {
      accounts: { mnemonic },
      chainId: 31337,
    },
    sepolia: {
      accounts: sepolia.accounts,
      chainId: 11155111,
      url: sepolia.url,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.27",
    settings: {
      metadata: { bytecodeHash: "none" },
      optimizer: { enabled: true, runs: 800 },
      evmVersion: "cancun",
    },
  },
  typechain: { outDir: "types", target: "ethers-v6" },
};

export default config;
