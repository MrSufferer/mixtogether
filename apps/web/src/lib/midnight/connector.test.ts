import { describe, expect, test } from "vitest";
import { MidnightDAppConnector, discoverMidnightWallets } from "./connector";

function walletApi(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    apiVersion: "4.0.1",
    networkId: "preprod",
    getConfiguration(this: { networkId: string }) {
      return { networkId: this.networkId, indexerUri: "https://indexer.wallet.example", proverServerUri: "" };
    },
    getConnectionStatus(this: { networkId: string }) {
      return { status: "connected", networkId: this.networkId };
    },
    getUnshieldedAddress() {
      return { address: "addr_test1_shroudly" };
    },
    ...overrides,
  };
}

function walletSource(api: Record<string, unknown>): Record<string, unknown> {
  return { lace: { apiVersion: "4.0.1", connect: async () => api } };
}

describe("Midnight DApp Connector boundary", () => {
  test("discovers Lace and preserves official receiver-bound calls", async () => {
    const api = walletApi();
    const connector = new MidnightDAppConnector(walletSource(api));

    expect(discoverMidnightWallets({ lace: walletSource(api).lace, invalid: {} })).toEqual(["lace"]);
    const connected = await connector.connect("lace");

    expect(connected.snapshot).toEqual({ walletId: "lace", address: "addr_test1_shroudly", network: "preprod", apiVersion: "4.0.1" });
    expect(connected.api.configuration).toEqual({ networkId: "preprod", apiVersion: "4.0.1", walletId: "lace", indexerUri: "https://indexer.wallet.example" });
  });

  test("rejects unsupported connector versions and networks", async () => {
    const unsupported = new MidnightDAppConnector(walletSource(walletApi({ apiVersion: "4.0.0" })));
    await expect(unsupported.connect("lace")).rejects.toMatchObject({ code: "UNSUPPORTED_VERSION" });

    const wrongNetwork = new MidnightDAppConnector(walletSource(walletApi({ networkId: "mainnet" })));
    await expect(wrongNetwork.connect("lace")).rejects.toMatchObject({ code: "UNSUPPORTED_NETWORK" });
  });

  test("fails when the wallet is no longer authorized", async () => {
    const disconnected = new MidnightDAppConnector(walletSource(walletApi({ getConnectionStatus: () => ({ status: "disconnected", networkId: "preprod" }) })));
    await expect(disconnected.connect("lace")).rejects.toMatchObject({ code: "AUTHORIZATION_REJECTED" });
  });
});
