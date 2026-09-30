export type PrivateStateBackup = Readonly<{
  format: "shroudly-private-state-backup";
  version: 1;
  environment: "preprod" | "mainnet-test-build";
  deploymentId: string;
  createdAt: string;
  generation: bigint;
  encryptedState: string;
}>;

export interface PrivateStateStore<T> {
  load(scope: string): Promise<T | null>;
  save(scope: string, state: T): Promise<void>;
  clear(scope: string): Promise<void>;
}

export class MemoryPrivateStateStore<T> implements PrivateStateStore<T> {
  private readonly values = new Map<string, T>();
  public async load(scope: string): Promise<T | null> { return this.values.get(scope) ?? null; }
  public async save(scope: string, state: T): Promise<void> { this.values.set(scope, state); }
  public async clear(scope: string): Promise<void> { this.values.delete(scope); }
}

export function createPrivateStateBackup(input: {
  environment: "preprod" | "mainnet-test-build";
  deploymentId: string;
  encryptedState: string;
  generation?: bigint;
  createdAt?: string;
}): PrivateStateBackup {
  if (!input.deploymentId.trim()) throw new Error("deployment identity is required");
  if (!input.encryptedState.trim()) throw new Error("encrypted private state is required");
  if (/ownerSecret|seedPhrase|privateKey/i.test(input.encryptedState)) throw new Error("backup must contain opaque encrypted state");
  return Object.freeze({
    format: "shroudly-private-state-backup",
    version: 1,
    environment: input.environment,
    deploymentId: input.deploymentId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    generation: input.generation ?? 0n,
    encryptedState: input.encryptedState,
  });
}

export function serializePrivateStateBackup(backup: PrivateStateBackup): string {
  return JSON.stringify(backup, (_, value) => typeof value === "bigint" ? `${value}n` : value);
}

export function parsePrivateStateBackup(serialized: string): PrivateStateBackup {
  const parsed: unknown = JSON.parse(serialized, (_, value) => typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value);
  if (!isRecord(parsed) || parsed.format !== "shroudly-private-state-backup" || parsed.version !== 1 ||
      (parsed.environment !== "preprod" && parsed.environment !== "mainnet-test-build") ||
      typeof parsed.deploymentId !== "string" || typeof parsed.createdAt !== "string" ||
      typeof parsed.generation !== "bigint" || parsed.generation < 0n ||
      typeof parsed.encryptedState !== "string" || !parsed.encryptedState.trim()) {
    throw new Error("invalid private-state backup");
  }
  return Object.freeze(parsed as PrivateStateBackup);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
