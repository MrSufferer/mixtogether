#!/usr/bin/env node

const RENDER_API = "https://api.render.com/v1";
const DEFAULT_REPOSITORY = "https://github.com/MrSufferer/mixtogether.git";
const DEFAULT_BRANCH = "codex/stage7-render-auth-check";

const apiKey = process.env.RENDER_API_KEY?.trim();
if (!apiKey) fail("RENDER_API_KEY is required");

const repository = process.env.RENDER_REPO_URL?.trim() || DEFAULT_REPOSITORY;
const branch = process.env.RENDER_GIT_BRANCH?.trim() || DEFAULT_BRANCH;
const ownerId = process.env.RENDER_OWNER_ID?.trim() || await resolveTeamOwner(apiKey);
const dryRun = process.argv.includes("--dry-run");

const definitions = [
  {
    name: "shroudly-preprod-sponsor",
    packageName: "@shroudly/sponsor",
    environmentVariables: undefined,
  },
  {
    name: "shroudly-preprod-randomness-signer",
    packageName: "@shroudly/randomness-signer",
    environmentVariables: [
      { key: "SHROUDLY_RANDOMNESS_CONTRIBUTOR", value: "render" },
      { key: "SHROUDLY_RENDER_AUTOMATION_TOKEN", generateValue: true },
    ],
  },
];

const existing = await listServices(apiKey, ownerId);
const results = [];
for (const definition of definitions) {
  const found = existing.find((service) => service.name === definition.name);
  if (found) {
    assertMatches(found, definition.name, repository, branch);
    results.push({ service: found, created: false });
    continue;
  }

  const request = {
    type: "web_service",
    name: definition.name,
    ownerId,
    repo: repository,
    branch,
    autoDeploy: "yes",
    serviceDetails: {
      runtime: "node",
      envSpecificDetails: {
        buildCommand: `pnpm install --frozen-lockfile && pnpm --filter ${definition.packageName} build`,
        startCommand: `pnpm --filter ${definition.packageName} start`,
      },
      healthCheckPath: "/healthz",
      plan: "free",
      region: "singapore",
      numInstances: 1,
    },
    ...(definition.environmentVariables ? { envVars: definition.environmentVariables } : {}),
  };

  if (dryRun) {
    results.push({ service: { name: definition.name, dashboardUrl: "not-created" }, created: false });
    continue;
  }
  const created = await renderRequest(apiKey, "/services", { method: "POST", body: request });
  const service = unwrapService(created);
  if (!service?.id || !service.name) fail(`Render did not return a service for ${definition.name}`);
  results.push({ service, created: true });
}

const output = [];
for (const result of results) {
  const service = result.service;
  const refreshed = dryRun ? service : await waitForService(apiKey, service.id);
  output.push({
    name: refreshed.name,
    id: refreshed.id,
    created: result.created,
    branch: refreshed.branch || branch,
    dashboardUrl: refreshed.dashboardUrl || `https://dashboard.render.com/web/${refreshed.id}`,
    sponsorUrl: refreshed.name === "shroudly-preprod-sponsor" ? refreshed.serviceDetails?.url || null : undefined,
    randomnessEndpoint: refreshed.name === "shroudly-preprod-randomness-signer" && refreshed.serviceDetails?.url ? `${refreshed.serviceDetails.url}/v1/randomness` : undefined,
    healthUrl: refreshed.serviceDetails?.url ? `${refreshed.serviceDetails.url}/healthz` : undefined,
  });
}

process.stdout.write(`${JSON.stringify({ ownerId, repository, branch, dryRun, services: output }, null, 2)}\n`);

async function resolveTeamOwner(key) {
  const owners = await renderRequest(key, "/owners", { method: "GET" });
  const team = (Array.isArray(owners) ? owners : []).find((owner) => owner?.type === "team" && typeof owner.id === "string");
  if (!team) fail("no Render team workspace was found; set RENDER_OWNER_ID explicitly");
  return team.id;
}

async function listServices(key, owner) {
  const response = await renderRequest(key, `/services?ownerId=${encodeURIComponent(owner)}&limit=100`, { method: "GET" });
  return (Array.isArray(response) ? response : []).map(unwrapService).filter(Boolean);
}

function assertMatches(service, expectedName, expectedRepository, expectedBranch) {
  if (service.repo && service.repo !== expectedRepository) fail(`Render service ${expectedName} exists with a different repository; refusing to mutate it`);
  if (service.branch && service.branch !== expectedBranch) fail(`Render service ${expectedName} exists on a different branch; refusing to mutate it`);
}

async function waitForService(key, serviceId) {
  let service = await renderRequest(key, `/services/${encodeURIComponent(serviceId)}`, { method: "GET" });
  for (let attempt = 0; attempt < 6 && !service?.serviceDetails?.url; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    service = await renderRequest(key, `/services/${encodeURIComponent(serviceId)}`, { method: "GET" });
  }
  return unwrapService(service) || service;
}

async function renderRequest(key, path, { method, body }) {
  const response = await fetch(`${RENDER_API}${path}`, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${key}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Render API ${method} ${path} failed with HTTP ${response.status}`);
  if (response.status === 204) return undefined;
  return response.json();
}

function unwrapService(value) {
  if (!value || typeof value !== "object") return null;
  if (value.service && typeof value.service === "object") return value.service;
  return value.id && value.name ? value : null;
}

function fail(message) {
  process.stderr.write(`render:stage7: ${message}\n`);
  process.exit(1);
}
