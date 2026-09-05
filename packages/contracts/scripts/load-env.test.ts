import test from "node:test";
import assert from "node:assert/strict";
import { resolveSepoliaConfig } from "./load-env";

const HARDHAT_DEFAULT_MNEMONIC =
  "test test test test test test test test test test test junk";

test("resolveSepoliaConfig: missing DEPLOYER_PRIVATE_KEY fails closed with empty accounts", () => {
  const config = resolveSepoliaConfig({});
  assert.deepEqual(config.accounts, []);
});

test("resolveSepoliaConfig: empty string or whitespace DEPLOYER_PRIVATE_KEY fails closed", () => {
  const config = resolveSepoliaConfig({ DEPLOYER_PRIVATE_KEY: "   " });
  assert.deepEqual(config.accounts, []);
});

test("resolveSepoliaConfig: present hex key returns accounts array containing the key", () => {
  const sampleKey = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const config = resolveSepoliaConfig({ DEPLOYER_PRIVATE_KEY: sampleKey });
  assert.deepEqual(config.accounts, [sampleKey]);
});

test("resolveSepoliaConfig: never falls back to public mnemonic even if MNEMONIC is set", () => {
  const config = resolveSepoliaConfig({
    MNEMONIC: HARDHAT_DEFAULT_MNEMONIC,
  });
  const accounts: string[] = config.accounts;
  assert.equal(accounts.includes(HARDHAT_DEFAULT_MNEMONIC), false);
  assert.deepEqual(accounts, []);
});

test("resolveSepoliaConfig: reads SEPOLIA_RPC_URL and ETHERSCAN_API_KEY from env", () => {
  const config = resolveSepoliaConfig({
    SEPOLIA_RPC_URL: "https://custom-sepolia.example.com",
    ETHERSCAN_API_KEY: "etherscan-secret-token",
  });
  assert.equal(config.url, "https://custom-sepolia.example.com");
  assert.equal(config.etherscanApiKey, "etherscan-secret-token");
});

test("resolveSepoliaConfig: falls back to public RPC default when SEPOLIA_RPC_URL is missing", () => {
  const config = resolveSepoliaConfig({});
  assert.equal(config.url, "https://ethereum-sepolia-rpc.publicnode.com");
  assert.equal(config.etherscanApiKey, "");
});

test("resolveSepoliaConfig: supports INFURA_API_KEY when SEPOLIA_RPC_URL is unset", () => {
  const config = resolveSepoliaConfig({ INFURA_API_KEY: "my-infura-id" });
  assert.equal(config.url, "https://sepolia.infura.io/v3/my-infura-id");
});
