#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));
const profilePath = resolve(root, args.profile ?? "apps/web/public/build-profile.json");
const profile = JSON.parse(readFileSync(profilePath, "utf8"));
const timeoutMs = numberArg(args.timeout, 5_000);
const checks = [];

if (args.offline) {
  checks.push({ name: "profile", ok: profile.environment === "preprod" && profile.networkId === "preprod" && profile.mainnetTransactionsEnabled === false, detail: "sanitized profile is Preprod-only" });
} else {
  for (const [name, url] of Object.entries(profile.endpoints ?? {})) {
    if (!url) { checks.push({ name, ok: true, detail: "not configured (optional endpoint)" }); continue; }
    checks.push(await probe(name, url, timeoutMs));
  }
  const heartbeat = process.env.BETTER_STACK_HEARTBEAT_URL;
  if (heartbeat) await pingHeartbeat(heartbeat, checks.every((check) => check.ok));
}

const report = { format: "shroudly-preprod-health-v1", checkedAt: new Date().toISOString(), deploymentId: profile.deploymentId, checks, healthy: checks.every((check) => check.ok), submissionAutomation: checks.every((check) => check.ok) ? "enabled-by-scheduler" : "disabled-until-recovery" };
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
