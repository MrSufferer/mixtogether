import { describe, expect, it } from "vitest";
import { mergePendingUnwraps, pendingUnwrapStore } from "./unwrap";

describe("asynchronous unwrap recovery", () => {
  it("persists request ids without private amounts", () => {
    const storage = new MemoryStorage();
    pendingUnwrapStore(storage).save("0xabc", ["0x04", "0x08"]);
    expect(pendingUnwrapStore(storage).load("0xabc")).toEqual(["0x04", "0x08"]);
    expect(storage.value).not.toContain("amount");
  });

  it("rediscovers wrapper events and removes finalized requests", () => {
    expect(mergePendingUnwraps(["0x01"], ["0x01", "0x02", "0x03"], ["0x02"])).toEqual(["0x01", "0x03"]);
  });
});

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  value = "";
  getItem() { return this.value || null; }
  setItem(_key: string, value: string) { this.value = value; }
}
