#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (!args.deployment || !/^[A-Za-z0-9._:-]+$/.test(args.deployment)) fail("--deployment is required and must be deployment-safe");
if (!args.confirm) fail("reset is intentionally gated; pass --confirm after reviewing the deployment ID");
const at = new Date().toISOString();
const marker = {
  format: "shroudly-preprod-reset-v1",
  deploymentId: args.deployment,
  invalidatedAt: at,
  invalidatesPrivateState: true,
  reason: args.reason ?? "operator-requested-preprod-reset",
  markerHash: `0x${createHash("sha256").update(`${args.deployment}|${at}|${randomBytes(16).toString("hex")}`).digest("hex")}`,
};
const output = resolve(args.out ?? `.shroudly-reset/${args.deployment}.json`);
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
const endpoint = process.env.SHROUDLY_RESET_ENDPOINT;
if (endpoint && args.submit) {
  const token = process.env.SHROUDLY_RESET_TOKEN;
  if (!token) fail("--submit requires SHROUDLY_RESET_TOKEN");
  const response = await fetch(endpoint, { method: "POST", redirect: "error", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ deploymentId: marker.deploymentId, markerHash: marker.markerHash }) });
  if (!response.ok) fail(`reset endpoint rejected request (${response.status})`);
}
process.stdout.write(`${JSON.stringify({ ...marker, output, submitted: Boolean(endpoint && args.submit) }, null, 2)}\n`);

function parseArgs(values) { const result = {}; for (let index = 0; index < values.length; index += 1) { const value = values[index]; if (value === "--confirm" || value === "--submit") result[value.slice(2)] = true; else if (value.startsWith("--")) result[value.slice(2)] = values[++index]; } return result; }
function fail(message) { process.stderr.write(`reset-preprod: ${message}\n`); process.exit(2); }
