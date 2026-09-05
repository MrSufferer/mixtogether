import { expect } from "chai";
import { resolveSepoliaConfig, DEFAULT_SEPOLIA_RPC_URL } from "../scripts/load-env";

const HARDHAT_DEFAULT_MNEMONIC =
  "test test test test test test test test test test test junk";

describe("resolveSepoliaConfig", function () {
  it("fails closed with empty accounts when DEPLOYER_PRIVATE_KEY is missing", function () {
    const config = resolveSepoliaConfig({});
    expect(config.accounts).to.deep.equal([]);
  });

  it("fails closed with empty accounts when DEPLOYER_PRIVATE_KEY is whitespace", function () {
    const config = resolveSepoliaConfig({ DEPLOYER_PRIVATE_KEY: "   " });
    expect(config.accounts).to.deep.equal([]);
  });

  it("returns accounts array containing present hex key", function () {
    const sampleKey = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const config = resolveSepoliaConfig({ DEPLOYER_PRIVATE_KEY: sampleKey });
    expect(config.accounts).to.deep.equal([sampleKey]);
  });

  it("never falls back to public mnemonic even if MNEMONIC is set", function () {
    const config = resolveSepoliaConfig({
      MNEMONIC: HARDHAT_DEFAULT_MNEMONIC,
    });
    expect(config.accounts).to.deep.equal([]);
  });

  it("reads SEPOLIA_RPC_URL and ETHERSCAN_API_KEY from env", function () {
    const config = resolveSepoliaConfig({
      SEPOLIA_RPC_URL: "https://custom-sepolia.example.com",
      ETHERSCAN_API_KEY: "etherscan-secret-token",
    });
    expect(config.url).to.equal("https://custom-sepolia.example.com");
    expect(config.etherscanApiKey).to.equal("etherscan-secret-token");
  });

  it("falls back to public RPC default when SEPOLIA_RPC_URL is missing", function () {
    const config = resolveSepoliaConfig({});
    expect(config.url).to.equal(DEFAULT_SEPOLIA_RPC_URL);
    expect(config.etherscanApiKey).to.equal("");
  });

  it("supports INFURA_API_KEY when SEPOLIA_RPC_URL is unset", function () {
    const config = resolveSepoliaConfig({ INFURA_API_KEY: "my-infura-id" });
    expect(config.url).to.equal("https://sepolia.infura.io/v3/my-infura-id");
  });

  it("falls back to vars function for non-secret values when env is unset", function () {
    const varsMap: Record<string, string> = {
      SEPOLIA_RPC_URL: "https://vars-sepolia.example.com",
      ETHERSCAN_API_KEY: "vars-etherscan-key",
    };
    const config = resolveSepoliaConfig({}, (key) => varsMap[key] || "");
    expect(config.url).to.equal("https://vars-sepolia.example.com");
    expect(config.etherscanApiKey).to.equal("vars-etherscan-key");
  });
});
