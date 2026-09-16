#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const contributors = ["render", "github-actions", "offline-maintainer"];
const args = parseArgs(process.argv.slice(2));
const action = args._[0];
if (!action || !["commit", "reveal"].includes(action)) usage("choose commit or reveal");
const drawId = required(args.draw, "--draw");
const deploymentId = required(args.deployment, "--deployment");
const contributor = required(args.contributor, "--contributor");
if (!contributors.includes(contributor)) usage("--contributor must be a registered contributor");
const contributorPrefix = `SHROUDLY_${contributor.toUpperCase().replaceAll("-", "_")}`;
const seedName = `${contributorPrefix}_SEED`;
const configuredSeedNames = contributors.map((name) => `SHROUDLY_${name.toUpperCase().replaceAll("-", "_")}_SEED`).filter((name) => Boolean(process.env[name]));
if (configuredSeedNames.length !== 1 || configuredSeedNames[0] !== seedName) usage(`the runner must expose only the isolated ${seedName} credential`);
const seed = process.env[seedName];
if (!seed) usage(`the isolated ${seedName} secret is required in the runner environment`);
const endpointName = `${contributorPrefix}_AUTOMATION_ENDPOINT`;
const tokenName = `${contributorPrefix}_AUTOMATION_TOKEN`;
const scopedAutomationNames = contributors.flatMap((name) => {
  const prefix = `SHROUDLY_${name.toUpperCase().replaceAll("-", "_")}`;
  return [`${prefix}_AUTOMATION_ENDPOINT`, `${prefix}_AUTOMATION_TOKEN`];
});

const reveal = digest("shroudly|randomness/contributor-reveal/v1", seed, "preprod", deploymentId, drawId);
const commitment = digest("shroudly|randomness/commit/v1", reveal, contributor, drawId);
const payload = {
  format: "shroudly-randomness-intent-v1",
  action,
  environment: "preprod",
  deploymentId,
  drawId,
  contributor,
  credentialScope: contributor,
  commitment,
  ...(action === "reveal" ? { reveal } : {}),
  idempotencyKey: digest("shroudly|automation/idempotency/v1", action, deploymentId, drawId, contributor).slice(0, 34),
};

if (args.out) {
  const output = resolve(args.out);
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  chmodSync(output, 0o600);
}

if (args.submit) {
  if (process.env.SHROUDLY_AUTOMATION_ENDPOINT || process.env.SHROUDLY_AUTOMATION_TOKEN) usage("generic automation credentials are not accepted; use the contributor-scoped endpoint and token");
  const configuredAutomationNames = scopedAutomationNames.filter((name) => Boolean(process.env[name]));
  if (configuredAutomationNames.length !== 2 || !configuredAutomationNames.includes(endpointName) || !configuredAutomationNames.includes(tokenName)) {
    usage(`the runner must expose only the isolated ${endpointName} and ${tokenName} credentials`);
  }
  const endpoint = process.env[endpointName];
  const token = process.env[tokenName];
  if (!endpoint || !token) usage(`--submit requires ${endpointName} and ${tokenName}`);
  let parsedEndpoint;
  try { parsedEndpoint = new URL(endpoint); } catch { usage(`${endpointName} must be a valid URL`); }
  if (parsedEndpoint.protocol !== "https:") usage(`${endpointName} must use HTTPS`);
  const response = await fetch(parsedEndpoint, { method: "POST", redirect: "error", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) {
    process.stderr.write(`randomness ${action} was rejected (${response.status})\n`);
    process.exitCode = 1;
  } else {
    let result;
    try { result = await response.json(); } catch { result = null; }
    if (!result?.ok || !/^0x[0-9a-fA-F]{64}$/.test(result.transaction?.transactionId ?? "") || result.transaction.networkFinalized !== true || result.transaction.indexerVisible !== true || result.transaction.ledgerConfirmed !== true) {
      process.stderr.write(`randomness ${action} did not return independently observed finality\n`);
      process.exitCode = 1;
    }
  }
}

// The seed is never printed or written. A reveal is a public protocol value;
// the secret itself remains isolated in the runner that owns this contributor.
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

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
function usage(message) { process.stderr.write(`preprod-randomness: ${message}\nUsage: node scripts/preprod-randomness.mjs <commit|reveal> --draw <id> --deployment <id> --contributor <id> [--out <file>] [--submit]\n`); process.exit(2); }
