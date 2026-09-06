import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  keccak256,
  parseEther,
  toUtf8Bytes,
} from "ethers";
import { loadRepoEnv, DEFAULT_SEPOLIA_RPC_URL } from "./load-env";
import { OFFICIAL_SEPOLIA } from "./addresses";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

loadRepoEnv();

const poolAbi = [
  "function drawState() view returns (uint64 drawId,uint8 phase,uint48 epochStartedAt,uint48 cutoff,uint48 scheduledCutoff,uint8 accrualCursor,uint8 selectionCursor,uint8 registeredSavers)",
  "function slotOf(address) view returns (uint8)",
  "function exitRequested(address) view returns (bool)",
  "function exitDrawId(address) view returns (uint64)",
  "function principalOf(address) view returns (bytes32)",
  "function winningsOf(address) view returns (bytes32)",
  "function withdrawAll() external",
  "function claimWinnings() external",
] as const;

async function main() {
  const rpc = process.env.SEPOLIA_RPC_URL || DEFAULT_SEPOLIA_RPC_URL;
  const poolAddress = process.env.POOL_ADDRESS!;
  console.log("=== MixTogether Two-Wallet Scenario Walkthrough ===");
  console.log("Pool:", poolAddress);

  const provider = new JsonRpcProvider(rpc, 11155111);
  const aliceKey = keccak256(toUtf8Bytes("mixtogether:smoke:saver:0"));
  const bobKey = keccak256(toUtf8Bytes("mixtogether:smoke:saver:1"));

  const alice = new Wallet(aliceKey, provider);
  const bob = new Wallet(bobKey, provider);
  console.log("Alice:", alice.address);
  console.log("Bob:", bob.address);

  const alicePool = new Contract(poolAddress, poolAbi, alice);
  const bobPool = new Contract(poolAddress, poolAbi, bob);

  // 1. Check registrations
  const aliceSlot = await alicePool.slotOf(alice.address);
  const bobSlot = await bobPool.slotOf(bob.address);
  console.log(`Verified registrations: Alice slot ${aliceSlot}, Bob slot ${bobSlot}`);

  // 2. Fetch ciphertext handles
  const alicePrincipalHandle = await alicePool.principalOf(alice.address);
  const aliceWinningsHandle = await alicePool.winningsOf(alice.address);
  const bobPrincipalHandle = await bobPool.principalOf(bob.address);
  console.log("Alice principal handle:", alicePrincipalHandle);
  console.log("Alice winnings handle:", aliceWinningsHandle);
  console.log("Bob principal handle:", bobPrincipalHandle);

  // 3. User decrypt Alice principal using Zama SDK
  console.log("Initializing Zama FHEVM SDK for user decryption...");
  const fhevm = await createInstance({
    ...SepoliaConfig,
    network: rpc,
  });

  const now = Math.floor(Date.now() / 1000);
  const duration = 1;
  const aliceKeypair = fhevm.generateKeypair();
  const aliceEip712 = fhevm.createEIP712(aliceKeypair.publicKey, [poolAddress], now, duration);
  const aliceSignature = await alice.signTypedData(
    aliceEip712.domain,
    { UserDecryptRequestVerification: aliceEip712.types.UserDecryptRequestVerification as any },
    aliceEip712.message,
  );

  console.log("Alice requesting userDecrypt of her principal handle...");
  const aliceDecrypted = await fhevm.userDecrypt(
    [{ handle: alicePrincipalHandle, contractAddress: poolAddress }],
    aliceKeypair.privateKey,
    aliceKeypair.publicKey,
    aliceSignature,
    [poolAddress],
    alice.address,
    now,
    duration,
  );
  console.log("Alice decrypted principal successfully:", aliceDecrypted);

  // 4. Cross-wallet decrypt denial: Bob attempts to userDecrypt Alice's principal handle
  console.log("Testing cross-wallet decrypt denial: Bob attempting to decrypt Alice's handle...");
  const bobKeypair = fhevm.generateKeypair();
  const bobEip712 = fhevm.createEIP712(bobKeypair.publicKey, [poolAddress], now, duration);
  const bobSignature = await bob.signTypedData(
    bobEip712.domain,
    { UserDecryptRequestVerification: bobEip712.types.UserDecryptRequestVerification as any },
    bobEip712.message,
  );

  let crossWalletDenied = false;
  try {
    await fhevm.userDecrypt(
      [{ handle: alicePrincipalHandle, contractAddress: poolAddress }],
      bobKeypair.privateKey,
      bobKeypair.publicKey,
      bobSignature,
      [poolAddress],
      bob.address,
      now,
      duration,
    );
    console.error("FAIL: Bob was able to decrypt Alice's handle!");
  } catch (err: any) {
    crossWalletDenied = true;
    console.log("CONFIRMED: Bob decrypt of Alice handle rejected as unauthorized!");
  }

  if (!crossWalletDenied) {
    throw new Error("Cross-wallet decrypt denial check failed!");
  }

  // 5. Claim winnings for Alice and Bob
  console.log("Alice submitting claimWinnings()...");
  const aliceClaimTx = await alicePool.claimWinnings({ gasLimit: 1_000_000n });
  const aliceClaimRc = await aliceClaimTx.wait();
  console.log(`Alice claim confirmed in block ${aliceClaimRc.blockNumber} (tx ${aliceClaimRc.hash}, gasUsed ${aliceClaimRc.gasUsed})`);

  console.log("Bob submitting claimWinnings()...");
  const bobClaimTx = await bobPool.claimWinnings({ gasLimit: 1_000_000n });
  const bobClaimRc = await bobClaimTx.wait();
  console.log(`Bob claim confirmed in block ${bobClaimRc.blockNumber} (tx ${bobClaimRc.hash}, gasUsed ${bobClaimRc.gasUsed})`);

  // 6. Alice withdrawAll()
  console.log("Alice submitting withdrawAll()...");
  const aliceWithdrawTx = await alicePool.withdrawAll({ gasLimit: 1_500_000n });
  const aliceWithdrawRc = await aliceWithdrawTx.wait();
  console.log(`Alice withdrawAll confirmed in block ${aliceWithdrawRc.blockNumber} (tx ${aliceWithdrawRc.hash}, gasUsed ${aliceWithdrawRc.gasUsed})`);

  const aliceExitReq = await alicePool.exitRequested(alice.address);
  const aliceExitDraw = await alicePool.exitDrawId(alice.address);
  console.log(`Alice exitRequested: ${aliceExitReq}, exitDrawId: ${aliceExitDraw}`);

  console.log("=== Two-Wallet Walkthrough Verification Complete ===");
  return {
    aliceSlot: Number(aliceSlot),
    bobSlot: Number(bobSlot),
    aliceDecrypted,
    crossWalletDenied,
    aliceClaimTx: aliceClaimRc.hash,
    bobClaimTx: bobClaimRc.hash,
    aliceWithdrawTx: aliceWithdrawRc.hash,
  };
}

if (process.argv[1]?.endsWith("walkthrough-two-wallets.ts")) {
  main().catch((err) => {
    console.error("Walkthrough failed:", err);
    process.exitCode = 1;
  });
}
