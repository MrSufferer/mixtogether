import { beforeEach, describe, expect, it } from "vitest";
import { SessionCredentialStorage } from "./session-storage";

describe("session-scoped Zama credential storage", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("round-trips bigint and byte-array permit fields without using localStorage", async () => {
    const storage = new SessionCredentialStorage("test:zama:");
    await storage.set("permit", { expires: 9n, transportKey: new Uint8Array([1, 2, 3]) });

    await expect(storage.get("permit")).resolves.toEqual({
      expires: 9n,
      transportKey: new Uint8Array([1, 2, 3]),
    });
    expect(window.localStorage.length).toBe(0);
  });

  it("deletes only the scoped credential", async () => {
    const storage = new SessionCredentialStorage("test:zama:");
    window.sessionStorage.setItem("unrelated", "keep");
    await storage.set("permit", { signature: "0x01" });
    await storage.delete("permit");

    await expect(storage.get("permit")).resolves.toBeNull();
    expect(window.sessionStorage.getItem("unrelated")).toBe("keep");
  });
});
