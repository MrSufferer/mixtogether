import type { Hex } from "./types";
import { bytes32, domain, hashWords, word } from "./hashing";

export type DrawAttestation = Readonly<{
  sourceChainId: bigint;
  router: Hex;
  strategy: Hex;
  drawId: bigint;
  sourceBlockNumber: bigint;
  sourceBlockHash: Hex;
  drawRoot: Hex;
  randomness: Hex;
  totalAssets: bigint;
  realizedYield: bigint;
  totalShareTwab: bigint;
  winnerCount: bigint;
  attestorSetNonce: bigint;
  expiry: bigint;
}>;

export type AttestationVerificationContext = Readonly<{
  currentBlock: bigint;
  currentTime: bigint;
  minimumFinalizedSourceBlock: bigint;
  expectedSourceChainId: bigint;
  expectedRouter: Hex;
  expectedStrategy: Hex;
  expectedAttestorSetNonce: bigint;
}>;

export type SignerResolver = (digest: Hex, signature: string) => string | undefined;

export type AttestationVerification = Readonly<{
  digest: Hex;
  signers: readonly string[];
}>;

export function canonicalAttestationDigest(attestation: DrawAttestation): Hex {
  return hashWords(
    domain("draw-attestation/v1"),
    word(attestation.sourceChainId),
    bytes32(attestation.router),
    bytes32(attestation.strategy),
    word(attestation.drawId),
    word(attestation.sourceBlockNumber),
    bytes32(attestation.sourceBlockHash),
    bytes32(attestation.drawRoot),
    bytes32(attestation.randomness),
    word(attestation.totalAssets),
    word(attestation.realizedYield),
    word(attestation.totalShareTwab),
    word(attestation.winnerCount),
    word(attestation.attestorSetNonce),
    word(attestation.expiry),
  );
}

export class DrawAttestationVerifier {
  private readonly consumed = new Set<Hex>();
  private lastDrawId = -1n;

  public constructor(
    private readonly attestors: readonly string[],
    private readonly threshold = 2,
  ) {
    if (attestors.length !== 3 || threshold !== 2) {
      throw new Error("the reference verifier requires a 2-of-3 attestor set");
    }
    const normalized = attestors.map(normalizeSigner);
    if (new Set(normalized).size !== normalized.length) {
      throw new Error("attestors must be unique");
    }
  }

  public verifyAndConsume(
    attestation: DrawAttestation,
    signatures: readonly string[],
    context: AttestationVerificationContext,
    resolveSigner: SignerResolver,
  ): AttestationVerification {
    const digest = canonicalAttestationDigest(attestation);
    if (this.consumed.has(digest)) throw new Error("attestation already consumed");
    if (attestation.drawId <= this.lastDrawId) {
      throw new Error("draw must advance monotonically");
    }
    if (attestation.sourceChainId !== context.expectedSourceChainId) {
      throw new Error("source chain mismatch");
    }
    if (bytes32(attestation.router).toLowerCase() !== bytes32(context.expectedRouter).toLowerCase()) {
      throw new Error("router mismatch");
    }
    if (bytes32(attestation.strategy).toLowerCase() !== bytes32(context.expectedStrategy).toLowerCase()) {
      throw new Error("strategy mismatch");
    }
    if (attestation.sourceBlockNumber < context.minimumFinalizedSourceBlock) {
      throw new Error("source block is not finalized");
    }
    if (attestation.expiry !== 0n && context.currentTime > attestation.expiry) {
      throw new Error("attestation expired");
    }
    if (attestation.attestorSetNonce !== context.expectedAttestorSetNonce) {
      throw new Error("attestor set nonce mismatch");
    }
    if (context.currentBlock < attestation.sourceBlockNumber) {
      throw new Error("local chain is behind source block");
    }

    const signers: string[] = [];
    for (const signature of signatures) {
      const signer = resolveSigner(digest, signature);
      if (!signer) continue;
      const normalized = normalizeSigner(signer);
      if (!this.attestors.map(normalizeSigner).includes(normalized)) continue;
      if (signers.includes(normalized)) throw new Error("duplicate attestor signature");
      signers.push(normalized);
    }
    if (signers.length < this.threshold) throw new Error("attestation threshold not met");

    this.consumed.add(digest);
    this.lastDrawId = attestation.drawId;
    return { digest, signers };
  }

  public isConsumed(digest: Hex): boolean {
    return this.consumed.has(digest);
  }
}

function normalizeSigner(signer: string): string {
  return signer.toLowerCase();
}
