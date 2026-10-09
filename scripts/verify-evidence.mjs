#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { qualificationJourneyError, transactionDigest, verifyQualificationAttestation } from "./qualification-attestation.mjs";

const args = parseArgs(process.argv.slice(2));
const directory = resolve(args.dir ?? "evidence/preprod");
const checksumsPath = resolve(directory, "checksums.txt");
if (!existsSync(checksumsPath)) fail("checksums.txt is missing");
const directoryRoot = realpathSync(directory);
const pinnedProfile = JSON.parse(readFileSync(resolve(import.meta.dirname, "../midnight/version-profile.json"), "utf8"));
const entries = readFileSync(checksumsPath, "utf8").split(/\r?\n/).filter(Boolean);
const checksums = new Map();
for (const entry of entries) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(entry);
  if (!match || !safeRelativePath(match[2])) fail("invalid checksum line");
  if (checksums.has(match[2])) fail(`duplicate checksum entry: ${match[2]}`);
  const file = evidenceFile(match[2]);
  if (!existsSync(file)) fail(`missing evidence file: ${match[2]}`);
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (actual !== match[1]) fail(`checksum mismatch: ${match[2]}`);
  checksums.set(match[2], actual);
}
if (!checksums.has("manifest.json")) fail("manifest.json is not checksummed");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
if (!manifest || typeof manifest !== "object" || manifest.format !== "shroudly-preprod-evidence-v1" || manifest.environment !== "preprod") fail("manifest is not a Shroudly Preprod evidence manifest");
if (typeof manifest.qualified !== "boolean") fail("manifest qualification status is invalid");
if (!Array.isArray(manifest.files)) fail("manifest file index is missing");
if (manifest.files.length !== checksums.size - 1) fail("manifest file index does not match checksums");
const indexedFiles = new Set();
for (const file of manifest.files) {
  if (!file || typeof file !== "object" || !safeRelativePath(file.path) || file.path === "manifest.json" || !/^[a-f0-9]{64}$/.test(file.sha256) || indexedFiles.has(file.path)) fail("manifest file index is invalid");
  if (checksums.get(file.path) !== file.sha256) fail(`manifest hash mismatch: ${file.path}`);
  indexedFiles.add(file.path);
}
for (const path of checksums.keys()) if (path !== "manifest.json" && !indexedFiles.has(path)) fail(`checksum is not listed in manifest: ${path}`);
if (!Array.isArray(manifest.artifactHashes) || !Array.isArray(manifest.transactions) || !Array.isArray(manifest.browserArtifacts) || !Array.isArray(manifest.browserArtifactHashes) || typeof manifest.sourceRevision !== "string" || typeof manifest.deploymentId !== "string") fail("manifest subject is invalid");
const profile = readIndexedJson("build-profile.json");
if (profile.environment !== manifest.environment || profile.deploymentId !== manifest.deploymentId || !sameArray(profile.artifactHashes, manifest.artifactHashes)) fail("manifest subject does not match its build profile");
if (manifest.browserArtifacts.length !== manifest.browserArtifactHashes.length || new Set(manifest.browserArtifacts).size !== manifest.browserArtifacts.length || manifest.browserArtifacts.some((path) => typeof path !== "string" || !path.startsWith("browser/") || !safeRelativePath(path) || !checksums.has(path))) fail("manifest browser artifact index is invalid");
const browserArtifactHashes = manifest.browserArtifacts.map((path) => createHash("sha256").update(readFileSync(evidenceFile(path))).digest("hex"));
if (!sameArray(browserArtifactHashes, manifest.browserArtifactHashes)) fail("manifest browser artifact hashes do not match");
if (manifest.qualified) verifyQualifiedEvidence(manifest, profile);
else if (manifest.qualificationAttestationFile !== undefined && manifest.qualificationAttestationFile !== null) fail("unqualified evidence cannot include a qualification attestation");
process.stdout.write(JSON.stringify({ verified: true, directory, files: entries.length, qualified: Boolean(manifest.qualified) }, null, 2) + "\n");

function verifyQualifiedEvidence(manifest, profile) {
  if (manifest.sourceRevision === "uncommitted" || manifest.deploymentId === "shroudly-preprod-unassigned") fail("qualified evidence has no committed release subject");
  if (manifest.transactions.length === 0 || manifest.transactions.some((record) => !(record && record.networkFinalized === true && record.indexerVisible === true && record.ledgerConfirmed === true))) fail("qualified evidence has an incomplete finality record");
  const journeyError = qualificationJourneyError(manifest.transactions, manifest.browserArtifactHashes, { deploymentId: manifest.deploymentId, sourceRevision: manifest.sourceRevision });
  if (journeyError) fail(journeyError);
  if (typeof manifest.qualificationAttestationFile !== "string" || !safeRelativePath(manifest.qualificationAttestationFile)) fail("qualified evidence is missing its signed qualification attestation");
  const attestation = readIndexedJson(manifest.qualificationAttestationFile);
  if (profile.qualificationVerifierFingerprint !== pinnedProfile.qualificationVerifierFingerprint || !/^[a-f0-9]{64}$/.test(pinnedProfile.qualificationVerifierFingerprint ?? "")) fail("qualified evidence has no reviewed pinned qualification verifier fingerprint");
  const trustedPublicKey = args["qualification-public-key"] ? readFile(args["qualification-public-key"]) : process.env.SHROUDLY_QUALIFICATION_PUBLIC_KEY;
  if (!trustedPublicKey) fail("qualified evidence requires --qualification-public-key or SHROUDLY_QUALIFICATION_PUBLIC_KEY");
  const verification = verifyQualificationAttestation(attestation, {
    environment: manifest.environment,
    deploymentId: manifest.deploymentId,
    sourceRevision: manifest.sourceRevision,
    artifactHashes: profile.artifactHashes,
    transactionDigests: manifest.transactions.map((record) => transactionDigest(record)),
    browserArtifactHashes: manifest.browserArtifactHashes,
    qualificationVerifierFingerprint: pinnedProfile.qualificationVerifierFingerprint,
  }, trustedPublicKey);
  if (!verification.ok) fail(verification.reason);
}

function readIndexedJson(path) {
  if (!safeRelativePath(path) || !checksums.has(path)) fail(`evidence file is not indexed: ${path}`);
  try { return JSON.parse(readFileSync(evidenceFile(path), "utf8")); }
  catch { fail(`evidence JSON is invalid: ${path}`); }
}

function readFile(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) fail(`qualification public key is missing: ${path}`);
  return readFileSync(resolved, "utf8");
}

function evidenceFile(path) {
  const resolved = resolve(directory, path);
  const relativePath = relative(directory, resolved);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) fail(`evidence path escapes bundle: ${path}`);
  if (!existsSync(resolved)) fail(`missing evidence file: ${path}`);
  let fileStat;
  let realFile;
  try {
    fileStat = lstatSync(resolved);
    realFile = realpathSync(resolved);
  } catch {
    fail(`evidence file cannot be inspected: ${path}`);
  }
  if (!fileStat.isFile()) fail(`evidence file is not a regular file: ${path}`);
  const realRelativePath = relative(directoryRoot, realFile);
  if (!realRelativePath || realRelativePath.startsWith("..") || isAbsolute(realRelativePath)) fail(`evidence file escapes bundle: ${path}`);
  return resolved;
}

function safeRelativePath(path) {
  return typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((part) => part === "" || part === "." || part === "..");
}

function sameArray(actual, expected) { return Array.isArray(actual) && Array.isArray(expected) && JSON.stringify(actual) === JSON.stringify(expected); }
function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value.startsWith("--")) result[value.slice(2)] = values[++index];
  }
  return result;
}
function fail(message) { process.stderr.write(`verify-evidence: ${message}\n`); process.exit(1); }
