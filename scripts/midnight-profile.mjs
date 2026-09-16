import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const profile = JSON.parse(readFileSync(resolve(root, "midnight/version-profile.json"), "utf8"));
const sourceNames = ["TmixAsset", "RandomnessThreshold", "YieldAdapter", "PrizePool"];
const sourcePaths = sourceNames.map((name) => resolve(root, `midnight/${name}.compact`));
const managedRoot = resolve(root, "midnight/managed");
const infoPaths = sourceNames.map((name) => resolve(managedRoot, name.replace(/[A-Z]/g, (letter, index) => `${index ? "-" : ""}${letter.toLowerCase()}`), "compiler/contract-info.json"));
const sourceMarkers = ["Shroudly", "supply cap", "threshold-only", "simulated-yield", "Disclosure Cohort", "claimNullifier", "deployerActive", "mintShieldedToken", "seedPrizeReserve", "receiveShielded", "sendShielded", "selection_bits", "participantTwab", "rolloverSubthreshold"];
const missingSources = sourcePaths.filter((path) => !existsSync(path));
const infos = infoPaths.filter((path) => existsSync(path)).map((path) => JSON.parse(readFileSync(path, "utf8")));
const allSources = sourcePaths.filter((path) => existsSync(path)).map((path) => readFileSync(path, "utf8")).join("\n");
const missingMarkers = sourceMarkers.filter((marker) => !allSources.toLowerCase().includes(marker.toLowerCase()));
const cli = spawnSync("compact", ["--version"], { cwd: root, encoding: "utf8" });
const compiler = spawnSync("compact", ["compile", "--version"], { cwd: root, encoding: "utf8" });
const runtime = spawnSync("compact", ["compile", "--runtime-version"], { cwd: root, encoding: "utf8" });
const language = spawnSync("compact", ["compile", "--language-version"], { cwd: root, encoding: "utf8" });
const installedCli = parseCliVersion(cli.stdout);
const installedCompiler = (compiler.stdout ?? "").trim();
const installedRuntime = (runtime.stdout ?? "").trim();
const installedLanguage = (language.stdout ?? "").trim();
const artifactHashes = sourcePaths.filter((path) => existsSync(path)).map((path) => createHash("sha256").update(readFileSync(path)).digest("hex"));
const commandVersionsAvailable = [cli, compiler, runtime, language].every((result) => result.status === 0);
const compactCompile = missingSources.length === 0 && infos.length === sourceNames.length && infos.every((info) => info["compiler-version"] === profile.compactCompiler && info["language-version"] === profile.compactLanguage && info["runtime-version"] === profile.compactRuntime);
const keySets = infoPaths.map((path, index) => expectedKeySet(path, sourceNames[index]));
const zkKeysGenerated = keySets.every(({ expected, missing }) => expected.length > 0 && missing.length === 0);
const compatibilityMatch = commandVersionsAvailable && installedCli === profile.compactCli && installedCompiler === profile.compactCompiler && installedRuntime === profile.compactRuntime && installedLanguage === profile.compactLanguage;

// Only facts derived from the installed toolchain and checked-in artifacts are
// gates here.  The profile's gates object is declarative metadata, not evidence;
// copying its true values would allow a self-asserted qualification.
const gates = {
  compactCompile,
  zkKeysGenerated,
  compatibilityMatch,
  contractIntegrationAttested: false,
  custodyMovementAttested: false,
  winnerSelectionAttested: false,
  faucetTimingAttested: false,
  propertyMatrix: false,
  adversarialReplayMatrix: false,
  scaleMatrix: false,
  providerProvisioned: false,
  browserEvidence: false,
  productionApproval: false,
  mainnetTransactionsEnabled: false,
};
const selfAssertedGatesIgnored = Object.entries(profile.gates ?? {}).filter(([key, value]) => value === true && gates[key] !== true).map(([key]) => key);
const result = { profile: profile.profile, expected: { cli: profile.compactCli, compiler: profile.compactCompiler, runtime: profile.compactRuntime, language: profile.compactLanguage }, installed: { cli: installedCli, compiler: installedCompiler, runtime: installedRuntime, language: installedLanguage }, contracts: sourceNames.map((name, index) => ({ name, source: sourcePaths[index].replace(`${root}/`, ""), artifact: existsSync(infoPaths[index]) })), artifactHashes, sourceMarkers: missingMarkers.length === 0 ? "complete" : missingMarkers, keySets, gates, selfAssertedGatesIgnored, qualification: { externalAttestationRequired: true }, readyForPreprod: Object.entries(gates).filter(([key]) => key !== "mainnetTransactionsEnabled").every(([, value]) => Boolean(value)) };
result.readyForPreprod = missingSources.length === 0 && missingMarkers.length === 0 && result.readyForPreprod;
console.log(JSON.stringify(result, null, 2));
if (missingSources.length || missingMarkers.length || !compactCompile || !compatibilityMatch) process.exitCode = 1;
if (process.argv.includes("--gate") && !result.readyForPreprod) process.exitCode = 1;

function parseCliVersion(output) {
  const value = (output ?? "").trim();
  return value.startsWith("compact ") ? value.slice("compact ".length).trim() : value;
}

function expectedKeySet(infoPath, sourceName) {
  const keyDirectory = resolve(infoPath, "..", "..", "keys");
  if (!existsSync(infoPath) || !existsSync(keyDirectory)) return { contract: sourceName, expected: [], missing: ["contract-info.json or keys directory"] };
  const info = JSON.parse(readFileSync(infoPath, "utf8"));
  const expected = (Array.isArray(info.circuits) ? info.circuits : [])
    .filter((circuit) => circuit && circuit.proof === true && typeof circuit.name === "string")
    .flatMap((circuit) => [`${circuit.name}.prover`, `${circuit.name}.verifier`]);
  const missing = expected.filter((name) => {
    const path = resolve(keyDirectory, name);
    try { return !existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0; }
    catch { return true; }
  });
  return { contract: sourceName, expected, missing };
}
