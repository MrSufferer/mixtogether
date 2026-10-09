import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sources = ["TmixAsset", "RandomnessThreshold", "YieldAdapter", "PrizePool"];
const skipZk = process.argv.includes("--skip-zk");
const managed = resolve(root, "midnight/managed");
mkdirSync(managed, { recursive: true });

for (const name of sources) {
  const source = resolve(root, `midnight/${name}.compact`);
  const target = resolve(managed, name.replace(/[A-Z]/g, (letter, index) => `${index ? "-" : ""}${letter.toLowerCase()}`));
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  const args = ["compile", ...(skipZk ? ["--skip-zk"] : []), source, target];
  const result = spawnSync("compact", args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Compiled ${sources.length} Shroudly Compact contracts${skipZk ? " (ZK keys skipped)" : ""}.`);
