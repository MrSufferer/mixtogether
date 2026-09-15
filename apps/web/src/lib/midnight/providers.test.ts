import { describe, expect, test } from "vitest";
import { MemoryPrivateStateStore } from "./private-state";
import { createMidnightProviderBoundaries } from "./providers";

const baseConfig = {
  network: "preprod" as const,
  rpcUrl: "https://rpc.preprod.midnight.network",
  indexerGraphqlUrl: "https://indexer.preprod.midnight.network/api/v4/graphql",
};

describe("Midnight provider boundaries", () => {
  test("defaults to local proving and keeps disconnected adapters explicit", async () => {
    const boundaries = createMidnightProviderBoundaries(baseConfig, {
      privateState: new MemoryPrivateStateStore<unknown>(),
    });

    expect(boundaries.status).toEqual({
      proofMode: "local",
      privateState: "local",
      publicData: "indexer",
      connector: "dapp-connector-boundary",
      dust: "explicit-approval-boundary",
    });
    await expect(boundaries.proof.prove({})).rejects.toThrow(
      "proof provider is not connected",
    );
    await expect(boundaries.wallet.connect()).rejects.toThrow(
      "wallet provider is not connected",
    );
  });

  test("requires explicit opt-in before remote proving can be selected", () => {
    expect(() =>
      createMidnightProviderBoundaries(
        { ...baseConfig, proofMode: "remote-opt-in" },
        { privateState: new MemoryPrivateStateStore<unknown>() },
      ),
    ).toThrow("remote proving requires explicit opt-in");

    const remote = createMidnightProviderBoundaries(
      { ...baseConfig, proofMode: "remote-opt-in", allowRemoteProof: true },
      { privateState: new MemoryPrivateStateStore<unknown>() },
    );
    expect(remote.status.proofMode).toBe("remote-opt-in");
  });
});
