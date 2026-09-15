#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const contributors = ["render", "github-actions", "offline-maintainer"];
const args = parseArgs(process.argv.slice(2));
const action = args._[0];
if (!action || !["commit", "reveal"].includes(action)) usage("choose commit or reveal");
const drawId = required(args.draw, "--draw");
const deploymentId = required(args.deployment, "--deployment");
const contributor = args.contributor ?? contributorForAction();
if (!contributors.includes(contributor)) usage("--contributor must be a registered contributor");
const seedName = `SHROUDLY_${contributor.toUpperCase().replaceAll("-", "_")}_SEED`;
const seed = process.env[seedName];
if (!seed) usage(`the isolated ${seedName} secret is required in the runner environment`);

const reveal = digest("shroudly|randomness/contributor-reveal/v1", seed, "preprod", deploymentId, drawId);
const commitment = digest("shroudly|randomness/commit/v1", reveal, contributor, drawId);
const payload = {
  format: "shroudly-randomness-intent-v1",
  action,
  environment: "preprod",
  deploymentId,
  drawId,
  contributor,
  commitment,
  ...(action === "reveal" ? { reveal } : {}),
  idempotencyKey: digest("shroudly|automation/idempotency/v1", action, deploymentId, drawId, contributor).slice(0, 34),
};

if (args.out) {
  const output = resolve(args.out);
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

if (args.submit) {
  const endpoint = process.env.SHROUDLY_AUTOMATION_ENDPOINT;
  const token = process.env.SHROUDLY_AUTOMATION_TOKEN;
  if (!endpoint || !token) usage("--submit requires SHROUDLY_AUTOMATION_ENDPOINT and SHROUDLY_AUTOMATION_TOKEN");
  const response = await fetch(endpoint, { method: "POST", redirect: "error", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) { process.stderr.write(`randomness ${action} was rejected (${response.status})\n`); process.exitCode = 1; }
}

// The seed is never printed or written. A reveal is a public protocol value;
// the secret itself remains isolated in the runner that owns this contributor.
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

function contributorForAction() { return action === "reveal" ? "github-actions" : "render"; }
function required(value, flag) { if (!value || !/^[A-Za-z0-9._:-]+$/.test(value)) usage(`${flag} is required and must be a deployment-safe identifier`); return value; }
function digest(...parts) { return `0x${createHash("sha256").update(parts.join("\u001f")).digest("hex")}`; }
function parseArgs(values) {
  const result = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--submit") result.submit = true;
    else if (value.startsWith("--")) result[value.slice(2)] = values[++index];
    else result._.push(value);
  }
  return result;
}
function usage(message) { process.stderr.write(`preprod-randomness: ${message}\nUsage: node scripts/preprod-randomness.mjs <commit|reveal> --draw <id> --deployment <id> [--contributor <id>] [--out <file>] [--submit]\n`); process.exit(2); }
