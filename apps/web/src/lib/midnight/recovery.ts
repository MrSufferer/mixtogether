import type { Hex } from "./types";
import { bytes32, randomBytes32 } from "./hashing";
import { createPrivateStateBackup, parsePrivateStateBackup, type PrivateStateBackup } from "./private-state";

export type RecoveryKitKey = Hex;
export type PrivateEnvironment = "preprod" | "mainnet-test-build";
export type RecoveryBundle = Readonly<{
  format: "shroudly-recovery-kit";
  version: 1;
  key: RecoveryKitKey;
  backup: PrivateStateBackup;
}>;
export type RecoveryEnvelope = Readonly<{
  environment: PrivateEnvironment;
  deploymentId: string;
  generation: bigint;
  nonce: string;
  ciphertext: string;
}>;

export type RecoveryDrill = Readonly<{ exported: boolean; restored: boolean; generation: bigint; state: unknown; checkedAt: string }>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesFromHex(value: Hex): Uint8Array {
  const result = new Uint8Array((value.length - 2) / 2);
  for (let i = 0; i < result.length; i += 1) result[i] = Number.parseInt(value.slice(2 + i * 2, 4 + i * 2), 16);
  return result;
}

function base64(bytes: Uint8Array): string {
  if (typeof btoa !== "function") throw new Error("base64 encoding is unavailable");
  // Spreading a large encrypted witness into Function arguments can exceed
  // the browser's argument limit. Encode bounded chunks instead.
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (typeof atob !== "function") throw new Error("base64 decoding is unavailable");
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable");
  return globalThis.crypto.subtle;
}

function aadFor(environment: PrivateEnvironment, deploymentId: string, generation: bigint): Uint8Array {
  return encoder.encode(`shroudly|${environment}|${deploymentId}|${generation}`);
}

function encodeState(state: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(state, (_, value) => typeof value === "bigint" ? `${value}n` : value));
}

function decodeState(serialized: string): unknown {
  return JSON.parse(serialized, (_, value) => typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value);
}

export function generateRecoveryKit(): RecoveryKitKey { return randomBytes32(); }

export function createRecoveryBundle(key: RecoveryKitKey, backup: PrivateStateBackup): RecoveryBundle {
  assertRecoveryKitKey(key);
  return Object.freeze({ format: "shroudly-recovery-kit", version: 1 as const, key, backup });
}

export function serializeRecoveryBundle(bundle: RecoveryBundle): string {
  return JSON.stringify(bundle, (_, value) => typeof value === "bigint" ? `${value}n` : value);
}

export function parseRecoveryBundle(serialized: string): RecoveryBundle {
  const parsed: unknown = JSON.parse(serialized, (_, value) => typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value);
  if (!isRecord(parsed) || parsed.format !== "shroudly-recovery-kit" || parsed.version !== 1 || typeof parsed.key !== "string" || !isPrivateStateBackup(parsed.backup)) {
    throw new Error("invalid Recovery Kit bundle");
  }
  assertRecoveryKitKey(parsed.key as RecoveryKitKey);
  return Object.freeze({ format: "shroudly-recovery-kit", version: 1, key: parsed.key as RecoveryKitKey, backup: parsed.backup as PrivateStateBackup });
}

export async function encryptPrivateState(input: {
  key: RecoveryKitKey;
  environment: PrivateEnvironment;
  deploymentId: string;
  generation: bigint;
  state: unknown;
}): Promise<RecoveryEnvelope> {
  assertRecoveryKitKey(input.key);
  const nonce = new Uint8Array(12);
  if (typeof globalThis.crypto?.getRandomValues !== "function") throw new Error("cryptographically secure randomness is unavailable");
  globalThis.crypto.getRandomValues(nonce);
  const cryptoKey = await subtle().importKey("raw", bytesFromHex(bytes32(input.key)).buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv: nonce.buffer as ArrayBuffer, additionalData: aadFor(input.environment, input.deploymentId, input.generation).buffer as ArrayBuffer }, cryptoKey, encodeState(input.state).buffer as ArrayBuffer);
  return Object.freeze({ environment: input.environment, deploymentId: input.deploymentId, generation: input.generation, nonce: base64(nonce), ciphertext: base64(new Uint8Array(ciphertext)) });
}

export async function decryptPrivateState(input: { key: RecoveryKitKey; envelope: RecoveryEnvelope; activeEnvironment: PrivateEnvironment; activeDeploymentId: string }): Promise<unknown> {
  assertRecoveryKitKey(input.key);
  if (input.envelope.environment !== input.activeEnvironment || input.envelope.deploymentId !== input.activeDeploymentId) {
    throw new Error("private state belongs to a different deployment");
  }
  const cryptoKey = await subtle().importKey("raw", bytesFromHex(bytes32(input.key)).buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await subtle().decrypt({ name: "AES-GCM", iv: fromBase64(input.envelope.nonce).buffer as ArrayBuffer, additionalData: aadFor(input.envelope.environment, input.envelope.deploymentId, input.envelope.generation).buffer as ArrayBuffer }, cryptoKey, fromBase64(input.envelope.ciphertext).buffer as ArrayBuffer);
  return decodeState(decoder.decode(plaintext));
}

export async function exportPrivateState(input: { key: RecoveryKitKey; environment: PrivateEnvironment; deploymentId: string; generation: bigint; state: unknown }): Promise<PrivateStateBackup> {
  const envelope = await encryptPrivateState(input);
  return createPrivateStateBackup({ environment: input.environment, deploymentId: input.deploymentId, generation: input.generation, encryptedState: JSON.stringify(envelope, (_, value) => typeof value === "bigint" ? `${value}n` : value) });
}

export async function restorePrivateState(input: { key: RecoveryKitKey; backup: PrivateStateBackup | string; activeEnvironment: PrivateEnvironment; activeDeploymentId: string; retiredDeployments?: readonly string[] }): Promise<{ state: unknown; generation: bigint }> {
  assertRecoveryKitKey(input.key);
  const backup = typeof input.backup === "string" ? parsePrivateStateBackup(input.backup) : input.backup;
  assertGeneration(backup.generation);
  if (input.retiredDeployments?.includes(backup.deploymentId)) throw new Error("retired deployment state is read-only and cannot be imported");
  if (backup.environment !== input.activeEnvironment || backup.deploymentId !== input.activeDeploymentId) throw new Error("private state belongs to a different deployment");
  const envelope = JSON.parse(backup.encryptedState, (_, value) => typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value) as RecoveryEnvelope;
  if (!isRecoveryEnvelope(envelope) || envelope.environment !== backup.environment || envelope.deploymentId !== backup.deploymentId || envelope.generation !== backup.generation) {
    throw new Error("private state backup generation binding is invalid");
  }
  const state = await decryptPrivateState({ key: input.key, envelope, activeEnvironment: input.activeEnvironment, activeDeploymentId: input.activeDeploymentId });
  return { state, generation: backup.generation };
}

/**
 * Verify a Recovery Kit artifact supplied by the participant.  This function
 * deliberately does not create a key or export a probe internally: a local
 * self-test must never qualify an account for contribution.
 */
export async function runRecoveryReadinessCheck(input: { key: RecoveryKitKey; backup: PrivateStateBackup; environment: PrivateEnvironment; deploymentId: string; retiredDeployments?: readonly string[] }): Promise<RecoveryDrill> {
  const restored = await restorePrivateState({ key: input.key, backup: input.backup, activeEnvironment: input.environment, activeDeploymentId: input.deploymentId, retiredDeployments: input.retiredDeployments });
  return { exported: Boolean(input.backup.encryptedState), restored: restored.state !== undefined && restored.generation === input.backup.generation, generation: restored.generation, state: restored.state, checkedAt: new Date().toISOString() };
}

function assertRecoveryKitKey(value: RecoveryKitKey): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("Recovery Kit key must contain 256 bits");
}

function isPrivateStateBackup(value: unknown): value is PrivateStateBackup {
  if (!isRecord(value)) return false;
  return value.format === "shroudly-private-state-backup" && value.version === 1 &&
    (value.environment === "preprod" || value.environment === "mainnet-test-build") &&
    typeof value.deploymentId === "string" && typeof value.createdAt === "string" &&
    typeof value.generation === "bigint" && value.generation >= 0n &&
    typeof value.encryptedState === "string" && value.encryptedState.length > 0;
}

function isRecoveryEnvelope(value: unknown): value is RecoveryEnvelope {
  return isRecord(value) &&
    (value.environment === "preprod" || value.environment === "mainnet-test-build") &&
    typeof value.deploymentId === "string" && value.deploymentId.trim().length > 0 &&
    typeof value.generation === "bigint" && value.generation >= 0n &&
    typeof value.nonce === "string" && value.nonce.length > 0 &&
    typeof value.ciphertext === "string" && value.ciphertext.length > 0;
}

function assertGeneration(value: unknown): asserts value is bigint {
  if (typeof value !== "bigint" || value < 0n) throw new Error("private state backup generation is invalid");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
