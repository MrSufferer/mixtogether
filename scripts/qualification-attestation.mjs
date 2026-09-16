import { createHash, createPublicKey, verify as verifyEd25519 } from "node:crypto";

export const QUALIFICATION_ATTESTATION_FORMAT = "shroudly-preprod-qualification-attestation-v1";

export function qualificationStatement(input) {
  return canonicalJson({
    format: QUALIFICATION_ATTESTATION_FORMAT,
    environment: input.environment,
    deploymentId: input.deploymentId,
    sourceRevision: input.sourceRevision,
    artifactHashes: input.artifactHashes,
    transactionDigests: input.transactionDigests,
    browserArtifactHashes: input.browserArtifactHashes,
    verifier: input.verifier,
    verifiedAt: input.verifiedAt,
  });
}

export function transactionDigest(record) {
  return createHash("sha256").update(canonicalJson(record)).digest("hex");
}

export function verifyQualificationAttestation(attestation, expected, trustedPublicKey) {
    if (!isRecord(attestation) || attestation.format !== QUALIFICATION_ATTESTATION_FORMAT ||
      attestation.environment !== expected.environment || attestation.deploymentId !== expected.deploymentId ||
      attestation.sourceRevision !== expected.sourceRevision || !sameArray(attestation.artifactHashes, expected.artifactHashes) ||
      !sameArray(attestation.transactionDigests, expected.transactionDigests) || !sameArray(attestation.browserArtifactHashes, expected.browserArtifactHashes) || typeof attestation.verifier !== "string" ||
      !attestation.verifier.trim() || typeof attestation.verifiedAt !== "string" || !validDate(attestation.verifiedAt) ||
      typeof attestation.publicKey !== "string" || typeof attestation.signature !== "string") return { ok: false, reason: "qualification attestation fields do not match the evidence subject" };
  try {
    if (!/^[a-f0-9]{64}$/.test(expected.qualificationVerifierFingerprint ?? "")) return { ok: false, reason: "qualification verification has no pinned verifier key" };
    if (!trustedPublicKey || attestation.publicKey.includes("PRIVATE KEY") || trustedPublicKey.includes("PRIVATE KEY")) return { ok: false, reason: "qualification verification requires a public key" };
    const attestedKey = qualificationPublicKeyFingerprint(attestation.publicKey);
    const trustedKey = qualificationPublicKeyFingerprint(trustedPublicKey);
    if (trustedKey !== expected.qualificationVerifierFingerprint || attestedKey !== expected.qualificationVerifierFingerprint) return { ok: false, reason: "qualification attestation is not signed by the pinned verifier key" };
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(attestation.signature)) return { ok: false, reason: "qualification attestation signature encoding is invalid" };
    const signature = Buffer.from(attestation.signature, "base64");
    if (signature.length !== 64 || !verifyEd25519(null, Buffer.from(qualificationStatement(attestation)), createPublicKey(attestation.publicKey), signature)) return { ok: false, reason: "qualification attestation signature is invalid" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "qualification attestation key or signature is invalid" };
  }
}

export function qualificationPublicKeyFingerprint(value) {
  return createHash("sha256").update(createPublicKey(value).export({ type: "spki", format: "der" })).digest("hex");
}

export function qualificationJourneyError(transactions, browserArtifactHashes, expected) {
  if (!Array.isArray(transactions) || transactions.length !== 8) return "qualified evidence requires exactly five contributions, one draw, one winner claim, and one Lace transaction";
  if (!Array.isArray(browserArtifactHashes) || browserArtifactHashes.length === 0 || browserArtifactHashes.some((hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) return "qualified evidence requires checksummed browser artifacts";
  const kinds = transactions.map((record) => record && record.kind);
  if (kinds.filter((kind) => kind === "contribution").length !== 5 || kinds.filter((kind) => kind === "draw").length !== 1 || kinds.filter((kind) => kind === "claim").length !== 1 || kinds.filter((kind) => kind === "lace-smoke").length !== 1) return "qualified evidence has an incomplete required journey record set";
  const transactionIds = new Set();
  for (const record of transactions) {
    if (!isRecord(record) || typeof record.transactionId !== "string" || !record.transactionId.trim() || transactionIds.has(record.transactionId) || record.networkFinalized !== true || record.indexerVisible !== true || record.ledgerConfirmed !== true || record.deploymentId !== expected.deploymentId || record.sourceRevision !== expected.sourceRevision) return "qualified evidence has an invalid or mismatched transaction record";
    transactionIds.add(record.transactionId);
  }
  const draw = transactions.find((record) => record && record.kind === "draw");
  const claim = transactions.find((record) => record && record.kind === "claim");
  const lace = transactions.find((record) => record && record.kind === "lace-smoke");
  if (draw?.winnerSelectedByContract !== true || claim?.winnerClaimed !== true || claim?.winnerSelectedByContract !== true || String(claim.drawId) !== String(draw.drawId) || lace?.provider !== "Lace") return "qualified evidence does not prove a contract-selected winner claim and Lace smoke transaction";
  return null;
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite values cannot be qualified");
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return JSON.stringify(`${value}n`);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  throw new Error("unsupported value in qualification statement");
}

function sameArray(actual, expected) { return Array.isArray(actual) && Array.isArray(expected) && canonicalJson(actual) === canonicalJson(expected); }
function validDate(value) { return Number.isFinite(Date.parse(value)); }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
