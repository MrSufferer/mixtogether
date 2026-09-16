import { describe, expect, test } from "vitest";
import { createAccountNote, deriveOwnerCommitment } from "./account";
import { hashWords } from "./hashing";

describe("Midnight reference scale gate", () => {
  test("handles 1,000 account notes and 10,000 commitment derivations", () => {
    const notes = Array.from({ length: 1_000 }, (_, index) => {
      const secret = `0x${index.toString(16).padStart(64, "0")}` as `0x${string}`;
      const salt = `0x${(index + 1).toString(16).padStart(64, "0")}` as `0x${string}`;
      return createAccountNote(deriveOwnerCommitment(secret, salt), BigInt(index + 1), 0n);
    });
    const commitments = Array.from({ length: 10_000 }, (_, index) => {
      const note = notes[index % notes.length];
      return hashWords(note.ownerCommitment, `commitment-${index}`);
    });

    expect(notes).toHaveLength(1_000);
    expect(new Set(notes.map((note) => note.ownerCommitment)).size).toBe(1_000);
    expect(commitments).toHaveLength(10_000);
    expect(new Set(commitments).size).toBe(10_000);
  });
});
