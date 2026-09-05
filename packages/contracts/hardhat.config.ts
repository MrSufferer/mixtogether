import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";

import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";

const mnemonic = vars.get(
  "MNEMONIC",
  "test test test test test test test test test test test junk",
);
const infuraApiKey = vars.get("INFURA_API_KEY", "");
const deployerPrivateKey = vars.get("DEPLOYER_PRIVATE_KEY", "");
// Never fall back to Hardhat's publicly known development mnemonic on a live
// network. Read-only Sepolia scripts work with no configured accounts, while
// deployment fails closed until an explicit key is supplied.
const sepoliaAccounts = deployerPrivateKey ? [deployerPrivateKey] : [];

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  etherscan: {
    apiKey: { sepolia: vars.get("ETHERSCAN_API_KEY", "") },
  },
  networks: {
    hardhat: {
      accounts: { mnemonic },
      chainId: 31337,
    },
    sepolia: {
      accounts: sepoliaAccounts,
      chainId: 11155111,
      url: vars.get(
        "SEPOLIA_RPC_URL",
        infuraApiKey
          ? `https://sepolia.infura.io/v3/${infuraApiKey}`
          : "https://ethereum-sepolia-rpc.publicnode.com",
      ),
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
