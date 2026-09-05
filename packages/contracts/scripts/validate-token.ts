import { Contract, Provider, Signer, getAddress } from "ethers";
import { ethers } from "hardhat";
import { OFFICIAL_SEPOLIA, SEPOLIA_CHAIN_ID } from "./addresses";

const wrapperAbi = [
  "function decimals() view returns (uint8)",
  "function underlying() view returns (address)",
  "function rate() view returns (uint256)",
  "function supportsInterface(bytes4) view returns (bool)",
] as const;

const tokenAbi = [
  "function decimals() view returns (uint8)",
  "function mint(address,uint256)",
] as const;

const registryAbi = [
  "function getConfidentialTokenAddress(address) view returns (bool,address)",
  "function getTokenAddress(address) view returns (bool,address)",
  "function isConfidentialTokenValid(address) view returns (bool)",
] as const;

export type TokenValidation = {
  chainId: bigint;
  wrapper: string;
  underlying: string;
  registry: string;
  decimals: number;
  rate: bigint;
  faucetSimulation: "passed" | "not-run";
};

async function assertCode(provider: Provider, address: string, label: string) {
  const code = await provider.getCode(address);
  if (code === "0x") throw new Error(`${label} has no deployed bytecode at ${address}`);
}

export async function validateOfficialPair(
  provider: Provider,
  faucetCaller?: Signer | string,
): Promise<TokenValidation> {
  const network = await provider.getNetwork();
  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(`Sepolia required; connected chain is ${network.chainId}`);
  }

  const { confidentialUsdc, underlyingUsdc, wrappersRegistry } = OFFICIAL_SEPOLIA;
  await Promise.all([
    assertCode(provider, confidentialUsdc, "cUSDC wrapper"),
    assertCode(provider, underlyingUsdc, "underlying USDC"),
    assertCode(provider, wrappersRegistry, "wrapper registry"),
  ]);

  const wrapper = new Contract(confidentialUsdc, wrapperAbi, provider);
  const underlying = new Contract(underlyingUsdc, tokenAbi, provider);
  const registry = new Contract(wrappersRegistry, registryAbi, provider);
  const [wrapperDecimals, underlyingDecimals, wrappedUnderlying, rate] =
    await Promise.all([
      wrapper.decimals() as Promise<bigint>,
      underlying.decimals() as Promise<bigint>,
      wrapper.underlying() as Promise<string>,
      wrapper.rate() as Promise<bigint>,
    ]);

  if (wrapperDecimals !== 6n || underlyingDecimals !== 6n) {
    throw new Error(
      `Expected six decimals; wrapper=${wrapperDecimals}, underlying=${underlyingDecimals}`,
    );
  }
  if (getAddress(wrappedUnderlying) !== getAddress(underlyingUsdc)) {
    throw new Error(`Wrapper reports unexpected underlying ${wrappedUnderlying}`);
  }
  if (rate !== 1n) throw new Error(`Expected a 1:1 wrapper rate; got ${rate}`);

  const [validByWrapper, registryToken] = (await registry.getTokenAddress(
    confidentialUsdc,
  )) as [boolean, string];
  const [validByToken, registryWrapper] =
    (await registry.getConfidentialTokenAddress(underlyingUsdc)) as [boolean, string];
  const valid = (await registry.isConfidentialTokenValid(
    confidentialUsdc,
  )) as boolean;
  if (!valid || !validByWrapper || !validByToken) {
    throw new Error("Official cUSDC pair is currently revoked or invalid in the registry");
  }
  if (
    getAddress(registryToken) !== getAddress(underlyingUsdc) ||
    getAddress(registryWrapper) !== getAddress(confidentialUsdc)
  ) {
    throw new Error("Registry pair does not match the configured official addresses");
  }

  let faucetSimulation: TokenValidation["faucetSimulation"] = "not-run";
  if (faucetCaller) {
    const recipient = getAddress(
      typeof faucetCaller === "string"
        ? faucetCaller
        : await faucetCaller.getAddress(),
    );
    const data = underlying.interface.encodeFunctionData("mint", [
      recipient,
      1_000_000n,
    ]);
    // eth_call supplies an arbitrary public caller without signing or sending a
    // transaction. A restricted faucet will still revert in this simulation.
    await provider.call({ data, from: recipient, to: underlyingUsdc });
    faucetSimulation = "passed";
  }

  return {
    chainId: network.chainId,
    wrapper: getAddress(confidentialUsdc),
    underlying: getAddress(underlyingUsdc),
    registry: getAddress(wrappersRegistry),
    decimals: Number(wrapperDecimals),
    rate,
    faucetSimulation,
  };
}

async function main() {
  const result = await validateOfficialPair(
    ethers.provider,
    "0x000000000000000000000000000000000000dEaD",
  );
  console.log(JSON.stringify(result, (_, value) =>
    typeof value === "bigint" ? value.toString() : value, 2));
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
