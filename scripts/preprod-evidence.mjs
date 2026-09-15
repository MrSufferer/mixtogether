#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));
const output = resolve(root, args.out ?? "evidence/preprod");
const profilePath = resolve(root, args.profile ?? "apps/web/public/build-profile.json");
if (!existsSync(profilePath)) fail(`build profile not found at ${relative(root, profilePath)}; run pnpm build first`);
mkdirSync(output, { recursive: true });
const profile = sanitize(JSON.parse(readFileSync(profilePath, "utf8")));
const sourceRevision = git(["rev-parse", "HEAD"]) || "uncommitted";
const recordPaths = asArray(args.record);
const transactions = recordPaths.map((path) => readRecord(resolve(path)));
const qualified = args.qualified === true;
if (qualified && transactions.length === 0) fail("--qualified requires at least one --record");
if (qualified && transactions.some((record) => !(record.networkFinalized === true && record.indexerVisible === true && record.ledgerConfirmed === true))) fail("every qualified transaction needs finality, indexer visibility, and fresh ledger confirmation");

const files = [];
writeJson("build-profile.json", profile);
files.push(fileEntry("build-profile.json"));
for (const path of recordPaths) {
  const destination = `transactions/${safeName(path)}`;
  writeJson(destination, sanitize(JSON.parse(readFileSync(resolve(path), "utf8"))));
  files.push(fileEntry(destination));
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
  retentionDays: 90,
  notes: qualified ? "Human review and supported Lace gate required before publication." : "Engineering dry-run; not network-qualified evidence.",
};
writeJson("manifest.json", manifest);
const checksumEntries = ["manifest.json", ...files.map(({ path }) => path)].map((path) => `${sha256(resolve(output, path))}  ${path}`);
writeFileSync(resolve(output, "checksums.txt"), `${checksumEntries.join("\n")}\n`, { mode: 0o644 });
process.stdout.write(`${JSON.stringify({ output, manifest: "manifest.json", qualified, sourceRevision, files: checksumEntries.length }, null, 2)}\n`);

function writeJson(path, value) { const destination = resolve(output, path); mkdirSync(resolve(destination, ".."), { recursive: true }); writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 }); }
function fileEntry(path) { return { path, sha256: sha256(resolve(output, path)) }; }
function readRecord(path) { if (!existsSync(path)) fail(`transaction record not found: ${path}`); const value = JSON.parse(readFileSync(path, "utf8")); if (!value || typeof value !== "object") fail(`transaction record is not an object: ${path}`); return sanitize(value); }
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
    } else if (value.startsWith("--")) {
      const key = value.slice(2);
      result[key] = values[++index];
    }
  }
  return result;
}
function fail(message) { process.stderr.write(`preprod-evidence: ${message}\n`); process.exit(2); }
