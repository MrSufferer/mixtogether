import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

async function main() {
  const artifactPath = join(
    process.cwd(),
    "artifacts/contracts/MixTogetherPool.sol/MixTogetherPool.json",
  );
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
    abi: unknown[];
  };
  const target = resolve(process.cwd(), "../../apps/web/src/contracts/pool.abi.json");
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, `${JSON.stringify(artifact.abi, null, 2)}\n`);
  console.log(`Exported MixTogetherPool ABI to ${target}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
