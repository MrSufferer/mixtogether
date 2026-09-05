import type { GenericStorage } from "@zama-fhe/sdk";

/** Browser-session credential storage with lossless BigInt/byte-array support. */
export class SessionCredentialStorage implements GenericStorage {
  constructor(private readonly prefix = "mixtogether:zama-permit:") {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = window.sessionStorage.getItem(this.prefix + key);
    return value ? decode(value) as T : null;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    window.sessionStorage.setItem(this.prefix + key, encode(value));
  }

  async delete(key: string): Promise<void> {
    window.sessionStorage.removeItem(this.prefix + key);
  }
}

function encode(value: unknown) {
  return JSON.stringify(value, (_, item) => {
    if (typeof item === "bigint") return { __mixType: "bigint", value: item.toString() };
    if (item instanceof Uint8Array) return { __mixType: "bytes", value: Array.from(item) };
    return item;
  });
}

function decode(value: string) {
  return JSON.parse(value, (_, item) => {
    if (!item || typeof item !== "object") return item;
    if (item.__mixType === "bigint") return BigInt(item.value);
    if (item.__mixType === "bytes") return new Uint8Array(item.value);
    return item;
  });
}
