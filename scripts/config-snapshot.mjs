#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const safeNames = ["VITE_SHROUDLY_DEPLOYMENT_ID", "VITE_SHROUDLY_RPC_URL", "VITE_SHROUDLY_INDEXER_URL", "VITE_SHROUDLY_ZK_CONFIG_URL", "VITE_SHROUDLY_SPONSOR_URL", "VITE_SHROUDLY_ASSET_CONTRACT_ID", "VITE_SHROUDLY_RANDOMNESS_CONTRACT_ID", "VITE_SHROUDLY_YIELD_CONTRACT_ID", "VITE_SHROUDLY_POOL_CONTRACT_ID", "VITE_SHROUDLY_ASSET_ARTIFACT_HASH", "VITE_SHROUDLY_RANDOMNESS_ARTIFACT_HASH", "VITE_SHROUDLY_YIELD_ARTIFACT_HASH", "VITE_SHROUDLY_POOL_ARTIFACT_HASH"];
const args = parseArgs(process.argv.slice(2));
const values = Object.fromEntries(safeNames.map((name) => [name, process.env[name] ?? ""]));
const snapshot = { format: "shroudly-config-snapshot-v1", generatedAt: new Date().toISOString(), values, snapshotHash: `0x${createHash("sha256").update(JSON.stringify(values)).digest("hex")}` };
const output = resolve(args.out ?? "evidence/config-snapshot.json");
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 });
process.stdout.write(`${JSON.stringify({ output, snapshotHash: snapshot.snapshotHash }, null, 2)}\n`);
function parseArgs(values) { const result = {}; for (let index = 0; index < values.length; index += 1) { const value = values[index]; if (value.startsWith("--")) result[value.slice(2)] = values[++index]; } return result; }
