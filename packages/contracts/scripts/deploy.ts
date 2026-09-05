import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { vars } from "hardhat/config";
import { ethers, network, run } from "hardhat";
import { validateOfficialPair } from "./validate-token";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No Sepolia deployer configured. Set the Hardhat DEPLOYER_PRIVATE_KEY variable before deployment.",
    );
  }
  const validation = await validateOfficialPair(ethers.provider, deployer);
  const guardian = process.env.GUARDIAN_ADDRESS || deployer.address;

  console.log(`Deploying MixTogetherPool from ${deployer.address}`);
  console.log(`Guardian: ${guardian}`);
  const pool = await ethers.deployContract("MixTogetherPool", [
    validation.wrapper,
    guardian,
  ]);
  await pool.waitForDeployment();
  const address = await pool.getAddress();
  const receipt = await pool.deploymentTransaction()?.wait();
  if (!receipt) throw new Error("Deployment receipt unavailable");

  const record = {
    network: network.name,
    chainId: validation.chainId.toString(),
    address,
    guardian,
    confidentialToken: validation.wrapper,
    underlyingToken: validation.underlying,
    registry: validation.registry,
    deploymentTransaction: receipt.hash,
    blockNumber: receipt.blockNumber,
    deployedAt: new Date().toISOString(),
  };

  const deploymentDirectory = join(process.cwd(), "deployments", network.name);
  await mkdir(deploymentDirectory, { recursive: true });
  await writeFile(
    join(deploymentDirectory, "MixTogetherPool.json"),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  console.log(JSON.stringify(record, null, 2));

  if (vars.get("ETHERSCAN_API_KEY", "")) {
    await run("verify:verify", {
      address,
      constructorArguments: [validation.wrapper, guardian],
    });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
