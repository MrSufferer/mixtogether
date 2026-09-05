import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { AbiCoder, type HDNodeWallet, type Signer } from "ethers";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { MixTogetherPoolHarness, TestConfidentialToken } from "../types";

const DEPOSIT = 1;
const PRIZE = 2;
const ONE_USDC = 1_000_000n;
const PRIZE_AMOUNT = 10n * ONE_USDC;
const encoder = AbiCoder.defaultAbiCoder();

type Fixture = {
  token: TestConfidentialToken;
  pool: MixTogetherPoolHarness;
  tokenAddress: string;
  poolAddress: string;
  guardian: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  keeper: HardhatEthersSigner;
};

async function fundedWallet(): Promise<HDNodeWallet> {
  const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
  await ethers.provider.send("hardhat_setBalance", [
    wallet.address,
    "0x56BC75E2D63100000", // 100 ETH
  ]);
  return wallet;
}

async function expectUserDecryptUnauthorized(
  promise: Promise<unknown>,
  userAddress: string,
  handle: string,
) {
  let thrown: Error | null = null;
  try {
    await promise;
  } catch (err: unknown) {
    thrown = err as Error;
  }
  expect(thrown).to.not.be.null;
  expect(thrown!.message).to.include(
    `User ${userAddress} is not authorized to user decrypt handle ${handle}!`,
  );
}

async function decrypt64(
  contract: MixTogetherPoolHarness,
  getter: string,
  signer: HardhatEthersSigner | HDNodeWallet | Signer,
  ...args: unknown[]
): Promise<bigint> {
  const method = (
    contract as unknown as Record<string, (...values: unknown[]) => Promise<string>>
  )[getter];
  const handle = await method(...args);
  return fhevm.userDecryptEuint(
    FhevmType.euint64,
    handle,
    await contract.getAddress(),
    signer,
  );
}

async function encryptedTransferAndCall(
  token: TestConfidentialToken,
  tokenAddress: string,
  sender: HardhatEthersSigner | HDNodeWallet | Signer,
  receiver: string,
  amount: bigint,
  mode: number,
) {
  const encrypted = await fhevm
    .createEncryptedInput(tokenAddress, await sender.getAddress())
    .add64(amount)
    .encrypt();

  return token
    .connect(sender)
    ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
      receiver,
      encrypted.handles[0],
      encrypted.inputProof,
      encoder.encode(["uint8"], [mode]),
    );
}

async function deployFixture(): Promise<Fixture> {
  const [guardian, alice, bob, keeper] = await ethers.getSigners();
  const token = (await ethers.deployContract(
    "TestConfidentialToken",
  )) as unknown as TestConfidentialToken;
  const tokenAddress = await token.getAddress();
  const pool = (await ethers.deployContract("MixTogetherPoolHarness", [
    tokenAddress,
    guardian.address,
  ])) as unknown as MixTogetherPoolHarness;
  const poolAddress = await pool.getAddress();

  await token.faucetMint(await alice.getAddress(), 50n * ONE_USDC);
  await token.faucetMint(await bob.getAddress(), 50n * ONE_USDC);
  await token.faucetMint(await guardian.getAddress(), 50n * ONE_USDC);

  return {
    token,
    pool,
    tokenAddress,
    poolAddress,
    guardian,
    alice,
    bob,
    keeper,
  };
}

describe("MixTogetherPool", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("locks the v1 configuration and starts an open five-minute epoch", async function () {
    const { pool, tokenAddress, guardian } = await deployFixture();
    const state = await pool.drawState();

    expect(await pool.confidentialToken()).to.equal(tokenAddress);
    expect(await pool.owner()).to.equal(await guardian.getAddress());
    expect(await pool.EPOCH_DURATION()).to.equal(300n);
    expect(await pool.NOMINAL_PRIZE()).to.equal(PRIZE_AMOUNT);
    expect(await pool.MAX_SAVERS()).to.equal(64n);
    expect(await pool.BATCH_SIZE()).to.equal(8n);
    expect(await pool.TICKET_UNIT()).to.equal(100_000n);
    expect(state.phase).to.equal(0n);
    expect(state.drawId).to.equal(1n);
  });

  it("authenticates callbacks and rejects malformed funding modes", async function () {
    const { pool, alice } = await deployFixture();

    await expect(
      pool
        .connect(alice)
        .onConfidentialTransferReceived(
          await alice.getAddress(),
          await alice.getAddress(),
          ethers.ZeroHash,
          encoder.encode(["uint8"], [DEPOSIT]),
        ),
    ).to.be.revertedWithCustomError(pool, "UnauthorizedToken");

    await expect(
      pool
        .connect(alice)
        .onConfidentialTransferReceived(
          await alice.getAddress(),
          await alice.getAddress(),
          ethers.ZeroHash,
          "0x01",
        ),
    ).to.be.reverted;
  });

  it("credits callback actuals to separate principal and reserve ledgers", async function () {
    const { token, pool, tokenAddress, poolAddress, guardian, alice } =
      await deployFixture();
    const aliceAddress = await alice.getAddress();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      4n * ONE_USDC,
      DEPOSIT,
    );
    await encryptedTransferAndCall(
      token,
      tokenAddress,
      guardian,
      poolAddress,
      12n * ONE_USDC,
      PRIZE,
    );

    expect(await pool.saverCount()).to.equal(1n);
    expect(await pool.saverAt(0)).to.equal(aliceAddress);
    expect(await decrypt64(pool, "principalOf", alice, aliceAddress)).to.equal(
      4n * ONE_USDC,
    );
    expect(await decrypt64(pool, "reserveForGuardian", guardian)).to.equal(
      12n * ONE_USDC,
    );

    // An over-sized transfer is accepted as an encrypted zero by ERC-7984 and
    // must not inflate accounting.
    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      100n * ONE_USDC,
      DEPOSIT,
    );
    expect(await decrypt64(pool, "principalOf", alice, aliceAddress)).to.equal(
      4n * ONE_USDC,
    );
  });

  it("lets the guardian pause deposits without stopping withdrawals", async function () {
    const { token, pool, tokenAddress, poolAddress, guardian, alice } =
      await deployFixture();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      ONE_USDC,
      DEPOSIT,
    );
    await pool.connect(guardian).pauseDeposits();

    await expect(
      encryptedTransferAndCall(
        token,
        tokenAddress,
        alice,
        poolAddress,
        ONE_USDC,
        DEPOSIT,
      ),
    ).to.be.revertedWithCustomError(pool, "DepositsPaused");

    await expect(pool.connect(alice).withdrawAll()).to.emit(pool, "Withdrawal");
    expect(
      await decrypt64(pool, "principalOf", alice, await alice.getAddress()),
    ).to.equal(0n);
  });

  it("preserves cutoff eligibility for a withdrawal during accrual", async function () {
    const { token, pool, tokenAddress, poolAddress, alice } =
      await deployFixture();
    const aliceAddress = await alice.getAddress();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      ONE_USDC,
      DEPOSIT,
    );
    const depositedAt = await pool.lastAccrual(aliceAddress);
    const scheduledCutoff = (await pool.drawState()).scheduledCutoff;
    await time.increase(300);
    await pool.closeDraw();
    await pool.connect(alice).withdrawAll();

    expect(await decrypt64(pool, "drawWeightOf", alice, aliceAddress)).to.equal(
      10n * (BigInt(scheduledCutoff) - BigInt(depositedAt)),
    );
    expect(await pool.exitRequested(aliceAddress)).to.equal(true);
  });

  it("batch-selects one confidential winner and rewrites every visited winnings handle", async function () {
    const { token, pool, tokenAddress, poolAddress, guardian, alice, bob, keeper } =
      await deployFixture();
    const aliceAddress = await alice.getAddress();
    const bobAddress = await bob.getAddress();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      2n * ONE_USDC,
      DEPOSIT,
    );
    await encryptedTransferAndCall(
      token,
      tokenAddress,
      bob,
      poolAddress,
      ONE_USDC,
      DEPOSIT,
    );
    await encryptedTransferAndCall(
      token,
      tokenAddress,
      guardian,
      poolAddress,
      15n * ONE_USDC,
      PRIZE,
    );

    const aliceBefore = await pool.winningsOf(aliceAddress);
    const bobBefore = await pool.winningsOf(bobAddress);
    await time.increase(300);
    await pool.connect(keeper).closeDraw();
    await pool.connect(keeper).processAccrualBatch();
    expect((await pool.drawState()).phase).to.equal(2n);

    // A zero fixed random word maps to the first non-empty interval.
    await pool.setRandomWord(0);
    await pool.connect(keeper).randomizeDraw();
    await pool.connect(keeper).processSelectionBatch();

    const state = await pool.drawState();
    expect(state.phase).to.equal(0n);
    expect(state.drawId).to.equal(2n);
    expect(await decrypt64(pool, "winningsOf", alice, aliceAddress)).to.equal(
      PRIZE_AMOUNT,
    );
    expect(await decrypt64(pool, "winningsOf", bob, bobAddress)).to.equal(0n);
    expect(await pool.winningsOf(aliceAddress)).not.to.equal(aliceBefore);
    expect(await pool.winningsOf(bobAddress)).not.to.equal(bobBefore);
    expect(await decrypt64(pool, "reserveForGuardian", guardian)).to.equal(
      5n * ONE_USDC,
    );
  });

  it("restores a reserved award when the draw has no weight", async function () {
    const { token, pool, tokenAddress, poolAddress, guardian, keeper } =
      await deployFixture();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      guardian,
      poolAddress,
      PRIZE_AMOUNT,
      PRIZE,
    );
    await time.increase(300);
    await pool.connect(keeper).closeDraw();
    await pool.connect(keeper).processAccrualBatch();
    await pool.connect(keeper).randomizeDraw();
    await pool.connect(keeper).processSelectionBatch();

    expect(await decrypt64(pool, "reserveForGuardian", guardian)).to.equal(
      PRIZE_AMOUNT,
    );
  });

  it("processes the fixed eight-saver FHE batches within the configured local HCU limits", async function () {
    const { token, pool, tokenAddress, poolAddress, guardian } = await deployFixture();
    const signers = await ethers.getSigners();
    const savers = signers.slice(1, 9);

    for (const saver of savers) {
      await token.faucetMint(await saver.getAddress(), 2n * ONE_USDC);
      await encryptedTransferAndCall(
        token,
        tokenAddress,
        saver,
        poolAddress,
        ONE_USDC,
        DEPOSIT,
      );
    }
    await encryptedTransferAndCall(
      token,
      tokenAddress,
      guardian,
      poolAddress,
      PRIZE_AMOUNT,
      PRIZE,
    );

    await time.increase(300);
    await pool.closeDraw();

    // These are the worst-case fixed batches: eight occupied slots and all
    // encrypted operations execute in a single transaction.
    await expect(pool.processAccrualBatch()).not.to.be.reverted;
    expect((await pool.drawState()).accrualCursor).to.equal(8n);
    await pool.processAccrualBatch();
    await pool.setRandomWord(0);
    await pool.randomizeDraw();
    await expect(pool.processSelectionBatch()).not.to.be.reverted;
    expect((await pool.drawState()).selectionCursor).to.equal(8n);
    await pool.processSelectionBatch();

    expect((await pool.drawState()).drawId).to.equal(2n);
  });

  it("allows zero-value claims and reclaims exited slots only after finalization", async function () {
    const { token, pool, tokenAddress, poolAddress, alice, keeper } =
      await deployFixture();
    const aliceAddress = await alice.getAddress();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      ONE_USDC,
      DEPOSIT,
    );
    await expect(pool.connect(alice).claimWinnings()).to.emit(pool, "Claim");
    await time.increase(300);
    await pool.connect(keeper).closeDraw();
    await pool.connect(alice).withdrawAll();
    await expect(pool.pruneExited([0])).to.be.revertedWithCustomError(
      pool,
      "WrongPhase",
    );
    await pool.processAccrualBatch();
    await pool.randomizeDraw();
    await pool.processSelectionBatch();
    await pool.pruneExited([0]);

    expect(await pool.saverAt(0)).to.equal(ethers.ZeroAddress);
    expect(await pool.slotOf(aliceAddress)).to.equal(0n);
  });

  it("holds an OPEN withdrawal through its draw and preserves its earned eligibility", async function () {
    const { token, pool, tokenAddress, poolAddress, guardian, alice, keeper } =
      await deployFixture();
    const aliceAddress = await alice.getAddress();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      ONE_USDC,
      DEPOSIT,
    );
    const depositedAt = await pool.lastAccrual(aliceAddress);
    await time.increase(60);
    await pool.connect(alice).withdrawAll();
    const withdrawnAt = await pool.lastAccrual(aliceAddress);

    expect(await pool.exitRequested(aliceAddress)).to.equal(true);
    expect(await pool.exitDrawId(aliceAddress)).to.equal(1n);
    await pool.pruneExited([0]);
    expect(await pool.saverAt(0)).to.equal(aliceAddress);
    expect(await pool.slotOf(aliceAddress)).to.equal(1n);

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      guardian,
      poolAddress,
      PRIZE_AMOUNT,
      PRIZE,
    );
    await time.increase(240);
    await pool.connect(keeper).closeDraw();
    await pool.connect(keeper).processAccrualBatch();
    expect(await decrypt64(pool, "drawWeightOf", alice, aliceAddress)).to.equal(
      10n * (BigInt(withdrawnAt) - BigInt(depositedAt)),
    );
    await pool.setRandomWord(0);
    await pool.connect(keeper).randomizeDraw();
    await pool.connect(keeper).processSelectionBatch();
    expect(await decrypt64(pool, "winningsOf", alice, aliceAddress)).to.equal(
      PRIZE_AMOUNT,
    );
    await pool.pruneExited([0]);
    expect(await pool.saverAt(0)).to.equal(ethers.ZeroAddress);
    expect(await pool.exitDrawId(aliceAddress)).to.equal(0n);
  });

  it("cancels both exit markers when a saver redeposits before pruning", async function () {
    const { token, pool, tokenAddress, poolAddress, alice } = await deployFixture();
    const aliceAddress = await alice.getAddress();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      ONE_USDC,
      DEPOSIT,
    );
    await pool.connect(alice).withdrawAll();
    expect(await pool.exitRequested(aliceAddress)).to.equal(true);
    expect(await pool.exitDrawId(aliceAddress)).to.equal(1n);

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      ONE_USDC,
      DEPOSIT,
    );
    expect(await pool.exitRequested(aliceAddress)).to.equal(false);
    expect(await pool.exitDrawId(aliceAddress)).to.equal(0n);
    await pool.pruneExited([0]);
    expect(await pool.saverAt(0)).to.equal(aliceAddress);
  });

  it("skips a pending exit while pruning a matured exit in the same batch", async function () {
    const { token, pool, tokenAddress, poolAddress, alice, bob, keeper } =
      await deployFixture();
    const aliceAddress = await alice.getAddress();
    const bobAddress = await bob.getAddress();

    for (const saver of [alice, bob]) {
      await encryptedTransferAndCall(
        token,
        tokenAddress,
        saver,
        poolAddress,
        ONE_USDC,
        DEPOSIT,
      );
      await pool.connect(saver).withdrawAll();
    }

    await time.increase(300);
    await pool.connect(keeper).closeDraw();
    await pool.connect(keeper).processAccrualBatch();
    await pool.connect(keeper).randomizeDraw();
    await pool.connect(keeper).processSelectionBatch();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      ONE_USDC,
      DEPOSIT,
    );
    await pool.connect(alice).withdrawAll();
    expect(await pool.exitDrawId(aliceAddress)).to.equal(2n);
    expect(await pool.exitDrawId(bobAddress)).to.equal(1n);

    await pool.pruneExited([0, 1]);
    expect(await pool.saverAt(0)).to.equal(aliceAddress);
    expect(await pool.saverAt(1)).to.equal(ethers.ZeroAddress);
    expect(await pool.exitDrawId(bobAddress)).to.equal(0n);
  });

  it("uses two-step guardian transfer", async function () {
    const { token, tokenAddress, pool, poolAddress, guardian, bob } = await deployFixture();
    const bobAddress = await bob.getAddress();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      guardian,
      poolAddress,
      PRIZE_AMOUNT,
      PRIZE,
    );
    const reserveBefore = await pool.reserveForGuardian();

    await pool.connect(guardian).transferOwnership(bobAddress);
    expect(await pool.owner()).to.equal(await guardian.getAddress());
    await pool.connect(bob).acceptOwnership();
    expect(await pool.owner()).to.equal(bobAddress);
    expect(await pool.reserveForGuardian()).not.to.equal(reserveBefore);
    expect(await decrypt64(pool, "reserveForGuardian", bob)).to.equal(PRIZE_AMOUNT);

    let formerGuardianCanDecrypt = true;
    try {
      await decrypt64(pool, "reserveForGuardian", guardian);
    } catch {
      formerGuardianCanDecrypt = false;
    }
    expect(formerGuardianCanDecrypt).to.equal(false);
    await expect(pool.connect(guardian).pauseDeposits()).to.be.reverted;
  });

  it("rejects the 65th saver with RegistryFull", async function () {
    this.timeout(180_000);
    const { token, pool, tokenAddress, poolAddress } = await deployFixture();
    const signers = await ethers.getSigners();
    const hardhatSavers = signers.slice(1); // 19 signers
    const randomSavers: (HardhatEthersSigner | HDNodeWallet)[] = [];
    for (let i = 0; i < 45; i++) {
      randomSavers.push(await fundedWallet());
    }
    const all64Savers = [...hardhatSavers, ...randomSavers];
    expect(all64Savers.length).to.equal(64);

    for (const saver of all64Savers) {
      const addr = await saver.getAddress();
      await token.faucetMint(addr, 2n * ONE_USDC);
      await encryptedTransferAndCall(
        token,
        tokenAddress,
        saver,
        poolAddress,
        ONE_USDC,
        DEPOSIT,
      );
    }

    expect(await pool.saverCount()).to.equal(64n);
    for (let i = 0; i < 64; i++) {
      expect(await pool.saverAt(i)).to.equal(await all64Savers[i].getAddress());
    }

    const saver65 = await fundedWallet();
    const saver65Addr = await saver65.getAddress();
    await token.faucetMint(saver65Addr, 2n * ONE_USDC);
    await expect(
      encryptedTransferAndCall(
        token,
        tokenAddress,
        saver65,
        poolAddress,
        ONE_USDC,
        DEPOSIT,
      ),
    ).to.be.revertedWithCustomError(pool, "RegistryFull");

    expect(await pool.saverCount()).to.equal(64n);
  });

  it("denies another saver user-decrypt of foreign principal and winnings", async function () {
    const { token, pool, tokenAddress, poolAddress, guardian, alice, bob } =
      await deployFixture();
    const aliceAddress = await alice.getAddress();
    const bobAddress = await bob.getAddress();
    const guardianAddress = await guardian.getAddress();
    const poolAddr = await pool.getAddress();

    await encryptedTransferAndCall(
      token,
      tokenAddress,
      alice,
      poolAddress,
      ONE_USDC,
      DEPOSIT,
    );
    await encryptedTransferAndCall(
      token,
      tokenAddress,
      bob,
      poolAddress,
      2n * ONE_USDC,
      DEPOSIT,
    );

    expect(await decrypt64(pool, "principalOf", alice, aliceAddress)).to.equal(
      ONE_USDC,
    );
    expect(await decrypt64(pool, "winningsOf", alice, aliceAddress)).to.equal(0n);

    const alicePrincipalHandle = await pool.principalOf(aliceAddress);
    const aliceWinningsHandle = await pool.winningsOf(aliceAddress);
    await expectUserDecryptUnauthorized(
      fhevm.userDecryptEuint(
        FhevmType.euint64,
        alicePrincipalHandle,
        poolAddr,
        bob,
      ),
      bobAddress,
      alicePrincipalHandle,
    );

    await expectUserDecryptUnauthorized(
      fhevm.userDecryptEuint(
        FhevmType.euint64,
        aliceWinningsHandle,
        poolAddr,
        bob,
      ),
      bobAddress,
      aliceWinningsHandle,
    );

    expect(await decrypt64(pool, "principalOf", bob, bobAddress)).to.equal(
      2n * ONE_USDC,
    );

    await expectUserDecryptUnauthorized(
      fhevm.userDecryptEuint(
        FhevmType.euint64,
        alicePrincipalHandle,
        poolAddr,
        guardian,
      ),
      guardianAddress,
      alicePrincipalHandle,
    );
  });
});
