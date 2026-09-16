/** Session-scoped storage for opaque provider credentials. */
export class SessionCredentialStorage {
  public constructor(private readonly prefix = "shroudly:session:") {}
  public async get<T = unknown>(key: string): Promise<T | null> { const value = typeof window === "undefined" ? null : window.sessionStorage.getItem(this.prefix + key); return value ? decode(value) as T : null; }
  public async set<T = unknown>(key: string, value: T): Promise<void> { if (typeof window === "undefined") throw new Error("session storage is unavailable"); window.sessionStorage.setItem(this.prefix + key, encode(value)); }
  public async delete(key: string): Promise<void> { if (typeof window !== "undefined") window.sessionStorage.removeItem(this.prefix + key); }
}
function encode(value: unknown): string { return JSON.stringify(value, (_, item) => typeof item === "bigint" ? { __shroudlyType: "bigint", value: item.toString() } : item instanceof Uint8Array ? { __shroudlyType: "bytes", value: Array.from(item) } : item); }
function decode(value: string): unknown { return JSON.parse(value, (_, item) => item?.__shroudlyType === "bigint" ? BigInt(item.value) : item?.__shroudlyType === "bytes" ? new Uint8Array(item.value) : item); }
