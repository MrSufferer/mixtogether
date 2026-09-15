#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve(process.argv[process.argv.indexOf("--dir") + 1] ?? "evidence/preprod");
const checksumsPath = resolve(directory, "checksums.txt");
if (!existsSync(checksumsPath)) fail("checksums.txt is missing");
const entries = readFileSync(checksumsPath, "utf8").split(/\r?\n/).filter(Boolean);
for (const entry of entries) {
  const match = /^(\w+)  (.+)$/.exec(entry);
  if (!match) fail("invalid checksum line");
  const file = resolve(directory, match[2]);
  if (!file.startsWith(`${directory}/`) || !existsSync(file)) fail(`missing evidence file: ${match[2]}`);
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (actual !== match[1]) fail(`checksum mismatch: ${match[2]}`);
}
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
if (manifest.format !== "shroudly-preprod-evidence-v1" || manifest.environment !== "preprod") fail("manifest is not a Shroudly Preprod evidence manifest");
if (manifest.qualified && (!Array.isArray(manifest.transactions) || manifest.transactions.length === 0 || manifest.transactions.some((record) => !(record.networkFinalized && record.indexerVisible && record.ledgerConfirmed)))) fail("qualified evidence has an incomplete finality record");
process.stdout.write(JSON.stringify({ verified: true, directory, files: entries.length, qualified: Boolean(manifest.qualified) }, null, 2) + "\n");
function fail(message) { process.stderr.write(`verify-evidence: ${message}\n`); process.exit(1); }
