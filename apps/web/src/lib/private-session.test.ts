import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { clearPrivateQueryCache } from "./private-session";

describe("private balance sessions", () => {
  it("evicts decrypted values and permit status without touching public reads", () => {
    const client = new QueryClient();
    const decryptionKey = [...zamaQueryKeys.decryption.all, "wallet-a"];
    const permitKey = [...zamaQueryKeys.hasPermit.all, "wallet-a"];
    const publicKey = ["drawState"];
    client.setQueryData(decryptionKey, { winnings: 3n });
    client.setQueryData(permitKey, true);
    client.setQueryData(publicKey, { phase: 0 });

    clearPrivateQueryCache(client);

    expect(client.getQueryData(decryptionKey)).toBeUndefined();
    expect(client.getQueryData(permitKey)).toBeUndefined();
    expect(client.getQueryData(publicKey)).toEqual({ phase: 0 });
  });
});
