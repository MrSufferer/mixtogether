#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));
const profilePath = resolve(root, args.profile ?? "apps/web/public/build-profile.json");
const profile = JSON.parse(readFileSync(profilePath, "utf8"));
const pinnedProfile = JSON.parse(readFileSync(resolve(root, "midnight/version-profile.json"), "utf8"));
const timeoutMs = numberArg(args.timeout, 5_000);
const checks = [];

if (args.offline) {
  checks.push({ name: "profile", ok: profile.environment === "preprod" && profile.networkId === "preprod" && profile.mainnetTransactionsEnabled === false, detail: "sanitized profile is Preprod-only" });
} else {
  const configurationIssues = validateProductionConfiguration(profile, pinnedProfile);
  checks.push({
    name: "configuration",
    ok: configurationIssues.length === 0,
    detail: configurationIssues.length === 0 ? "immutable deployment, provider endpoints, artifact hashes, and compatibility profile are configured" : configurationIssues.join("; "),
  });
  for (const [name, url] of Object.entries(profile.endpoints ?? {})) {
    if (!url) { checks.push({ name, ok: false, detail: "required production endpoint is not configured" }); continue; }
    checks.push(await probe(name, url, timeoutMs));
  }
  const heartbeat = process.env.BETTER_STACK_HEARTBEAT_URL;
  if (heartbeat) await pingHeartbeat(heartbeat, checks.every((check) => check.ok));
}

const healthy = checks.every((check) => check.ok);
const report = { format: "shroudly-preprod-health-v1", checkedAt: new Date().toISOString(), deploymentId: profile.deploymentId, checks, healthy, submissionAutomation: args.offline ? "disabled-offline-profile-only" : healthy ? "enabled-by-scheduler" : "disabled-until-recovery" };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.healthy) process.exitCode = 1;

async function probe(name, url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { method: "GET", redirect: "error", signal: controller.signal, headers: { accept: "application/json" } });
    return { name, ok: response.ok, status: response.status, detail: response.ok ? "endpoint responded" : "endpoint returned an unhealthy status" };
  } catch (error) {
    return { name, ok: false, detail: error?.name === "AbortError" ? `timeout after ${timeout}ms` : "endpoint unavailable" };
  } finally { clearTimeout(timer); }
}

async function pingHeartbeat(url, healthy) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try { await fetch(url, { method: "POST", redirect: "error", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ status: healthy ? "up" : "down" }) }); }
  catch { /* alert delivery must never hide the health report */ }
  finally { clearTimeout(timer); }
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--offline") result.offline = true;
    else if (value.startsWith("--")) result[value.slice(2)] = values[++index];
  }
  return result;
}

function numberArg(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validateProductionConfiguration(candidate, pinned) {
  const issues = [];
  if (candidate.environment !== "preprod" || candidate.networkId !== "preprod" || candidate.mainnetTransactionsEnabled !== false) issues.push("profile must be Preprod-only with Mainnet disabled");
  if (!candidate.deploymentId || candidate.deploymentId === "shroudly-preprod-unassigned") issues.push("immutable deployment ID is not assigned");
  for (const name of ["asset", "randomness", "yield", "pool"]) {
    const value = candidate.contractIds?.[name];
    if (!value || value === "unassigned") issues.push(`${name} contract ID is not assigned`);
  }
  for (const name of ["rpc", "indexer", "zkConfig", "sponsor"]) {
    const value = candidate.endpoints?.[name];
    if (!value) issues.push(`${name} endpoint is not configured`);
    else if (!isHttpsUrl(value)) issues.push(`${name} endpoint must use HTTPS`);
  }
  if (!Array.isArray(candidate.artifactHashes) || candidate.artifactHashes.length !== 4 || candidate.artifactHashes.some((value) => typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value))) issues.push("four pinned Compact artifact hashes are required");
  if (candidate.qualificationVerifierFingerprint !== pinned.qualificationVerifierFingerprint || typeof candidate.qualificationVerifierFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(candidate.qualificationVerifierFingerprint)) issues.push("reviewed qualification verifier fingerprint is not pinned");
  const compatibility = candidate.compatibility ?? {};
  const expected = {
    compactCli: pinned.compactCli,
    compactLanguage: pinned.compactLanguage,
    compactCompiler: pinned.compactCompiler,
    compactRuntime: pinned.compactRuntime,
    midnightJs: pinned.midnightJs,
    walletSdk: pinned.walletSdk,
    dappConnector: pinned.dappConnector,
    node: pinned.node,
    indexer: pinned.indexer,
    proofServer: pinned.proofServer,
  };
  for (const [name, value] of Object.entries(expected)) if (compatibility[name] !== value) issues.push(`compatibility mismatch for ${name}`);
  return issues;
}

function isHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}
