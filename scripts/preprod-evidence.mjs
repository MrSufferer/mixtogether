#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { QUALIFICATION_ATTESTATION_FORMAT, qualificationJourneyError, transactionDigest, verifyQualificationAttestation } from "./qualification-attestation.mjs";

const root = resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));
const output = resolve(root, args.out ?? "evidence/preprod");
const profilePath = resolve(root, args.profile ?? "apps/web/public/build-profile.json");
if (!existsSync(profilePath)) fail(`build profile not found at ${relative(root, profilePath)}; run pnpm build first`);
const profile = sanitize(JSON.parse(readFileSync(profilePath, "utf8")));
const pinnedProfile = JSON.parse(readFileSync(resolve(root, "midnight/version-profile.json"), "utf8"));
const committedRevision = git(["rev-parse", "HEAD"]);
const sourceRevision = committedRevision && !git(["status", "--porcelain", "--untracked-files=all"]) ? committedRevision : "uncommitted";
const recordPaths = asArray(args.record);
const transactions = recordPaths.map((path) => readRecord(resolve(path)));
const browserArtifacts = asArray(args["browser-artifact"]).map((path) => readBrowserArtifact(resolve(path)));
const browserArtifactHashes = browserArtifacts.map((artifact) => artifact.sha256);
const requestedQualified = args.qualified === true;
if (!requestedQualified && args.attestation) fail("--attestation is only valid with --qualified");
if (requestedQualified && sourceRevision === "uncommitted") fail("--qualified requires a committed source revision");
if (requestedQualified && transactions.length === 0) fail("--qualified requires at least one --record");
if (requestedQualified && transactions.some((record) => !(record.networkFinalized === true && record.indexerVisible === true && record.ledgerConfirmed === true))) fail("every qualified transaction needs finality, indexer visibility, and fresh ledger confirmation");
if (requestedQualified && profile.deploymentId === "shroudly-preprod-unassigned") fail("--qualified requires an assigned deployment identity");
if (requestedQualified) {
  const journeyError = qualificationJourneyError(transactions, browserArtifactHashes, { deploymentId: profile.deploymentId, sourceRevision });
  if (journeyError) fail(journeyError);
}

let qualificationAttestation = null;
if (requestedQualified) {
  if (!args.attestation) fail("--qualified requires an externally signed --attestation");
  const attestationPath = resolve(args.attestation);
  if (!existsSync(attestationPath)) fail(`qualification attestation not found: ${attestationPath}`);
  const rawAttestation = JSON.parse(readFileSync(attestationPath, "utf8"));
  if (profile.qualificationVerifierFingerprint !== pinnedProfile.qualificationVerifierFingerprint || !/^[a-f0-9]{64}$/.test(pinnedProfile.qualificationVerifierFingerprint ?? "")) fail("--qualified requires a reviewed profile with a pinned qualification verifier fingerprint");
  const trustedPublicKey = args["qualification-public-key"] ? readFileSync(resolve(args["qualification-public-key"]), "utf8") : process.env.SHROUDLY_QUALIFICATION_PUBLIC_KEY;
  if (!trustedPublicKey) fail("--qualified requires --qualification-public-key or SHROUDLY_QUALIFICATION_PUBLIC_KEY");
  const verification = verifyQualificationAttestation(rawAttestation, { environment: profile.environment, deploymentId: profile.deploymentId, sourceRevision, artifactHashes: profile.artifactHashes, transactionDigests: transactions.map((record) => transactionDigest(record)), browserArtifactHashes, qualificationVerifierFingerprint: pinnedProfile.qualificationVerifierFingerprint }, trustedPublicKey);
  if (!verification.ok) fail(verification.reason);
  qualificationAttestation = {
    format: QUALIFICATION_ATTESTATION_FORMAT,
    environment: rawAttestation.environment,
    deploymentId: rawAttestation.deploymentId,
    sourceRevision: rawAttestation.sourceRevision,
    artifactHashes: rawAttestation.artifactHashes,
    transactionDigests: rawAttestation.transactionDigests,
    browserArtifactHashes: rawAttestation.browserArtifactHashes,
    verifier: rawAttestation.verifier,
    verifiedAt: rawAttestation.verifiedAt,
    publicKey: rawAttestation.publicKey,
    signature: rawAttestation.signature,
  };
}
const qualified = qualificationAttestation !== null;
mkdirSync(output, { recursive: true });

const files = [];
writeJson("build-profile.json", profile);
files.push(fileEntry("build-profile.json"));
for (const path of recordPaths) {
  const destination = `transactions/${safeName(path)}`;
  if (files.some((file) => file.path === destination)) fail(`duplicate transaction name: ${destination}`);
  writeJson(destination, sanitize(JSON.parse(readFileSync(resolve(path), "utf8"))));
  files.push(fileEntry(destination));
}
for (const artifact of browserArtifacts) {
  const destination = `browser/${safeName(artifact.path)}`;
  if (files.some((file) => file.path === destination)) fail(`duplicate browser artifact name: ${destination}`);
  const target = resolve(output, destination);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, artifact.contents, { mode: 0o644 });
  files.push(fileEntry(destination));
}
if (qualificationAttestation) {
  writeJson("qualification-attestation.json", qualificationAttestation);
  files.push(fileEntry("qualification-attestation.json"));
}
const manifest = {
  format: "shroudly-preprod-evidence-v1",
  qualified,
  generatedAt: new Date().toISOString(),
  sourceRevision,
  deploymentId: profile.deploymentId,
  environment: profile.environment,
  artifactHashes: profile.artifactHashes,
  transactions,
  files,
  browserArtifacts: browserArtifacts.map((artifact) => `browser/${safeName(artifact.path)}`),
  browserArtifactHashes,
  qualificationAttestationFile: qualificationAttestation ? "qualification-attestation.json" : null,
  retentionDays: 90,
  notes: qualified ? "Externally signed qualification attestation verified against this profile and transaction set; supported Lace and human publication gates remain required." : "Engineering dry-run; not network-qualified evidence.",
};
writeJson("manifest.json", manifest);
const checksumEntries = ["manifest.json", ...files.map(({ path }) => path)].map((path) => `${sha256(resolve(output, path))}  ${path}`);
writeFileSync(resolve(output, "checksums.txt"), `${checksumEntries.join("\n")}\n`, { mode: 0o644 });
process.stdout.write(`${JSON.stringify({ output, manifest: "manifest.json", qualified, sourceRevision, files: checksumEntries.length }, null, 2)}\n`);

function writeJson(path, value) { const destination = resolve(output, path); mkdirSync(resolve(destination, ".."), { recursive: true }); writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 }); }
function fileEntry(path) { return { path, sha256: sha256(resolve(output, path)) }; }
function readRecord(path) { if (!existsSync(path)) fail(`transaction record not found: ${path}`); const value = JSON.parse(readFileSync(path, "utf8")); if (!value || typeof value !== "object") fail(`transaction record is not an object: ${path}`); return sanitize(value); }
function readBrowserArtifact(path) { if (!existsSync(path)) fail(`browser artifact not found: ${path}`); let stat; try { stat = lstatSync(path); } catch { fail(`browser artifact cannot be inspected: ${path}`); } if (!stat.isFile()) fail(`browser artifact is not a regular file: ${path}`); return { path, contents: readFileSync(path), sha256: sha256(path) }; }
function sanitize(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (!value || typeof value !== "object") return typeof value === "string" && secretKey(key) ? "[REDACTED]" : value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, secretKey(name) ? "[REDACTED]" : sanitize(item, name)]));
}
function secretKey(key) { return /(?:secret|seed|mnemonic|private.?key|password|authorization|cookie|witness|ciphertext|backup.?id|wallet.?address|commitment|nullifier|payload|token)/i.test(key); }
function safeName(path) { return path.split(/[\\/]/).pop().replace(/[^A-Za-z0-9._-]/g, "_"); }
function asArray(value) { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function git(arguments_) { const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8" }); return result.status === 0 ? result.stdout.trim() : ""; }
function parseArgs(values) {
  const result = { record: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--qualified") result.qualified = true;
    else if (value === "--record") {
      const record = values[++index];
      if (record) result.record.push(record);
    } else if (value === "--browser-artifact") {
      const artifact = values[++index];
      if (artifact) result["browser-artifact"] = [...asArray(result["browser-artifact"]), artifact];
    } else if (value.startsWith("--")) {
      const key = value.slice(2);
      result[key] = values[++index];
    }
  }
  return result;
}
function fail(message) { process.stderr.write(`preprod-evidence: ${message}\n`); process.exit(2); }
