import type { Hex } from "./types";
import { bytes32, domain, hashWords, word } from "./hashing";

export type NullifierKind =
  | "account"
  | "deposit"
  | "faucet"
  | "win"
  | "claim"
  | "withdraw";

export type AccountNote = Readonly<{
  ownerCommitment: Hex;
  principalShares: bigint;
  accumulatedBalanceSeconds: bigint;
  lastUpdate: bigint;
  nonce: bigint;
  salt: Hex;
}>;

export type AccountUpdate = Readonly<{ note: AccountNote; balanceSeconds: bigint }>;

function requireNonNegative(name: string, value: bigint): void {
  if (value < 0n) throw new Error(`${name} cannot be negative`);
}

export function deriveOwnerCommitment(ownerSecret: Hex, salt: Hex): Hex {
  return hashWords(domain("owner/v1"), bytes32(ownerSecret), bytes32(salt));
}

export function createAccountNote(
  ownerCommitment: Hex,
  principalShares: bigint,
  effectiveTime: bigint,
  nonce = 0n,
  salt: Hex = `0x${"00".repeat(32)}` as Hex,
): AccountNote {
  requireNonNegative("principalShares", principalShares);
  requireNonNegative("effectiveTime", effectiveTime);
  requireNonNegative("nonce", nonce);
  return Object.freeze({
    ownerCommitment: bytes32(ownerCommitment),
    principalShares,
    accumulatedBalanceSeconds: 0n,
    lastUpdate: effectiveTime,
    nonce,
    salt: bytes32(salt),
  });
}

export function twabAt(note: AccountNote, effectiveTime: bigint): bigint {
  requireNonNegative("effectiveTime", effectiveTime);
  if (effectiveTime < note.lastUpdate) throw new Error("effective time moved backwards");
  return note.accumulatedBalanceSeconds + note.principalShares * (effectiveTime - note.lastUpdate);
}

export function updateAccount(note: AccountNote, effectiveTime: bigint, principalShares = note.principalShares): AccountUpdate {
  requireNonNegative("principalShares", principalShares);
  const balanceSeconds = twabAt(note, effectiveTime);
  return {
    balanceSeconds,
    note: Object.freeze({ ...note, principalShares, accumulatedBalanceSeconds: balanceSeconds, lastUpdate: effectiveTime, nonce: note.nonce + 1n }),
  };
}

export function accountNoteCommitment(note: AccountNote): Hex {
  return hashWords(
    domain("account-note/v1"), note.ownerCommitment, word(note.principalShares),
    word(note.accumulatedBalanceSeconds), word(note.lastUpdate), word(note.nonce), note.salt,
  );
}

export function nullifier(kind: NullifierKind, ownerCommitment: Hex, objectId: Hex, nonce: bigint): Hex {
  return hashWords(domain(`nullifier/${kind}/v1`), ownerCommitment, objectId, word(nonce));
}

export function claimNullifier(ownerCommitment: Hex, drawId: bigint, winningCommitment: Hex): Hex {
  return nullifier("claim", ownerCommitment, winningCommitment, drawId);
}
