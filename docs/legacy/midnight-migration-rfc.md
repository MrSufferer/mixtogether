# Deep Research RFC: MixTogether FHEVM to Midnight ZK

**Status:** Proposed; conditional preprod no-go

**Date:** 2026-09-15

**Scope:** Full replacement of FHEVM private accounting and winner selection with Midnight commitments, nullifiers, local private state, and user-generated proofs. React/Vite remains the application shell. EVM remains only the public custody, yield, randomness, and settlement plane.

## 1. Decision summary

MixTogether should migrate to a two-plane protocol:

1. An EVM YieldVaultRouter owns pooled stablecoin principal in one audited, live ERC-4626 strategy, harvests only positive realized yield, obtains public verifiable randomness, and finalizes source-chain deposit/withdrawal batches.
2. A Midnight PrivatePrizeVault owns private account notes and eligibility proofs, publishes only commitments and nullifiers, lets users privately test their own winning zone, and pays registered winners pro rata from a fixed harvested-yield budget.

The migration removes Zama/FHE from private accounting and draw computation. It does not translate FHE ciphertexts. Existing users exit the Sepolia demo and explicitly enter the new pool. Legacy withdrawals and claims remain available through the migration window.

The recommended strategy candidate is Spark Vaults V2 spUSDC, the official USDC ERC-4626 deployment at 0x28B3a8fb53B741A8Fd78c0fb9A6B2393d896a43d on Ethereum mainnet. Spark documents the vault as ERC-4626, publishes its deployment in the official address registry, and publishes versioned audits. This is a source-backed selection, not a preprod approval: the exact official preprod deployment and positive accrual path must be verified before acceptance. If it cannot be verified, preprod remains no-go.

The MVP uses one prize tier with an expected winner count of one. It deliberately permits zero or multiple winners. A registered winner receives floor(harvestedYield / winnerCount); the rounding remainder remains yield reserve. No principal is prize liquidity, and prize liabilities can never exceed harvested yield.

### Current decision

**Preprod: NO-GO today, conditionally eligible for a limited GO.** The existing repository validates a small FHEVM demo, not the proposed Midnight protocol. It uses mock assets and donated prize reserve. The proposed preprod can go only after the isolated Compact spikes compile, the adversarial/economic/scale gates pass, and an official test deployment of the selected external strategy demonstrates real accrual through the complete yield/VRF/batch/attestation path. The current official Midnight network update reviewed for this RFC demonstrates stablecoin bridging in preview environments, but does not establish this exact EVM ERC-4626 real-yield deployment; availability must be verified rather than assumed.[^6]

**Production: NO-GO until the separate production gate in §14 passes.** It requires independent audits of Compact and Solidity, an audited trust-minimized bridge or independently verified message path, accepted strategy and bridge risks, exercised emergency exits, a proving UX within budget or embedded/browser proving, and production monitoring for solvency, attestor quorum, draw lateness, sponsor abuse, and cross-chain reconciliation.

### Implementation status (2026-09-15)

The repository-local implementation pass for this RFC is complete through the compile and reference-integration stage. It includes the frozen legacy deposit path and exit notice, the pinned Compact/toolchain profile, a compiling `PrivatePrizeVault` circuit spike with generated local proving artifacts, account-note/TWAB and private-win reference logic, private-state/provider/timeline boundaries, a Solidity `YieldVaultRouter`, a 2-of-3 draw-attestation verifier, and regression/property/scale coverage for those layers.

The profile remains **preprod-no-go**. The exact first-party Spark preprod deployment and positive real accrual, live VRF/finality/bridge-message integration, local proof and sponsor latency budgets, independent audits, and production approval remain intentionally unverified. Generated Compact artifacts are machine-local and ignored under `midnight/managed/`; they are not a substitute for the §14 acceptance matrix.

### Non-negotiable design constraints

- There is no participant array and no circuit that loops over all users.
- Midnight block time is never entropy. Randomness comes from an EVM VRF and is authenticated by a draw attestation.
- The user’s private witness is proved locally by default. A remote proof server is an explicit opt-in, not the default privacy posture.[^4]
- EffectStream may feed a read model, but it cannot authorize money movement. Its official pattern is community maintained and does not provide atomic bridge execution.[^5]
- A 2-of-3 secp256k1 committee is a preprod custody/settlement trust assumption only. Production needs an audited trust-minimized bridge or an independently verified message path.
- A product claim must not promise guaranteed principal safety, end-to-end anonymity, or anonymous source-chain entry and exit.

## 2. Scope, assumptions, and terminology

### In scope

- An evidence-backed audit of the current Solidity, tests, keeper, frontend, and documented trust boundaries.
- Feasibility of replacing shared encrypted FHE computation with private user notes and proofs.
- A target architecture and locked interfaces for the EVM and Midnight planes.
- A threat model covering witnesses, roots, nullifiers, bridge attestations, VRF, strategy risk, proving, and operations.
- A staged legacy migration and explicit privacy/custody boundaries.
- Compile, property, adversarial, economic, operational, and scale acceptance gates.

### Out of scope

- Translating or decrypting legacy FHE ciphertexts.
- Selecting a production bridge before its audit and message-verification design are available.
- Claiming the selected strategy is approved for preprod without a first-party test deployment and live accrual evidence.
- Implementing the Compact circuits in this RFC. The interfaces below are the contract between the architecture spike and implementation.

### Assumptions and defaults

- “Full migration” removes FHEVM from private accounting and draws, while permitting an EVM adapter for audited yield custody, public VRF, and settlement.
- The preprod objective is approximately 1,000 users and at least 10,000 historical commitments. Mainnet-scale decentralization is designed for, but not implemented prematurely.
- Real yield means a live, audited external strategy. A first-party official test deployment may be used; minting or mocking interest is prohibited.
- Probabilistic private claims replace the exact-one-winner invariant.
- Local proving is the default despite Docker/Lace onboarding friction.
- Cross-chain entry and exit are explicit privacy and custody boundaries.
- Amounts in the RFC are integer base units. All division specifies rounding and an invariant.

## 3. Evidence baseline and repository validation

### Repository snapshot

The audit was performed against the current feat/mixtogether worktree at commit cb4633c (fix(mixtogether): reject reverted receipts and drain 64-slot smoke). Pre-existing untracked paths were preserved:

- .commandcode/
- skills-lock.json

No unrelated files were modified by this RFC.

### Required validation sequence

The initial baseline had no workspace dependency directories (node_modules, packages/contracts/node_modules, or apps/web/node_modules), so the current validation attempt stopped before tests because workspace dependencies were absent. Install the locked dependencies before rerunning `pnpm check`. The required sequence was:

~~~text
pnpm install --frozen-lockfile
pnpm --filter @mixtogether/contracts build
pnpm check
pnpm build
~~~

The locked install completed successfully with pnpm 8.15.9. The first post-install pnpm check stopped during contracts lint because Hardhat-generated packages/contracts/types did not yet exist; it did not reach tests. The normal contracts build generated the typings and compiled 22 Solidity files. The rerun then passed:

| Check | Result |
| --- | --- |
| Locked dependency install | Pass; lockfile up to date; 703 packages installed |
| Contract typings and Solidity compile | Pass; 84 typings generated, 22 Solidity files compiled |
| Workspace lint | Pass |
| Workspace typecheck | Pass |
| Contract tests | Pass; 35 tests |
| Web tests | Pass; 14 tests in 6 files |
| Production build | Pass; Vite bundle built, with existing third-party annotation and large-chunk warnings |

The table above records the pre-implementation baseline for the current demo only. It is not evidence that the Midnight architecture is feasible, that an audited yield strategy is available on preprod, or that the existing EVM demo is production safe.

### Implementation-pass validation (2026-09-15)

The repository-local execution of this RFC adds the following checks:

| Check | Result |
| --- | --- |
| `pnpm check` | Pass; lint, typecheck, 27 web tests, and 39 contract tests |
| `pnpm build` | Pass; contracts compile and Vite production build completes with the warnings above |
| `pnpm midnight:profile` | Pass; compiler/source markers and generated artifacts match the pinned profile |
| `pnpm midnight:compile` | Pass; Compact compile spike completes |
| `pnpm midnight:compile:keys` | Pass; all 12 prover/verifier pairs are generated locally |
| `pnpm midnight:check` | Pass; profile, compile, web tests, and contract tests complete |
| Browser journey suite | Pass; 10 desktop/mobile freeze-and-exit journeys |
| Preprod readiness gate | **NO-GO**; strategy deployment, positive accrual, live integration, and production gates remain false |

These results validate the local implementation boundaries and reference behavior. They do not substitute for the external §14 gates.

The current repository itself labels the application experimental, unaudited, and backed by mock assets.[^repo-security] The current web build also continues to expose the FHEVM/Zama stack and the Sepolia demo flow.[^repo-app]

## 4. Current-system audit

### 4.1 Protocol topology

The current system is a direct browser-to-Sepolia application:

~~~text
Saver wallet
  │ public wallet connection, signatures, transaction timing
  ▼
React/Vite + wagmi/viem + Zama React SDK
  │ public EVM reads and writes       │ relayer/KMS-backed private decrypt/reveal
  ▼                                    ▼
Mock USDC → cUSDC wrapper → MixTogetherPool ← permissionless keeper/caller
                                      │
                                      └─ FHEVM encrypted state and FHE operations
~~~

The repository documents no application backend or database. Any funded address may call phase functions, while the keeper script polls every 12 seconds when run with --watch.[^repo-architecture][^repo-keeper]

### 4.2 End-to-end flow

#### Deposit

1. The browser mints mock USDC, approves an exact public amount, and wraps it into cUSDC.
2. The cUSDC wrapper invokes onConfidentialTransferReceived with ABI-encoded mode DEPOSIT = 1.
3. The pool authenticates the callback caller and callback data, then _receiveDeposit requires OPEN, unpaused deposits, and a timestamp before the scheduled five-minute cutoff.
4. _register allocates a public address slot if slotOf[saver] == 0.
5. _accrueUntil accrues prior private principal up to the current timestamp.
6. The encrypted principal and encrypted aggregate principal increase. Exit flags are cleared.

Code evidence: callback authentication and mode dispatch are at [MixTogetherPool.sol:117-140](../packages/contracts/contracts/MixTogetherPool.sol#L117-L140); deposit state transition is at [MixTogetherPool.sol:360-374](../packages/contracts/contracts/MixTogetherPool.sol#L360-L374).

#### Withdrawal

- In OPEN, the pool accrues the caller through the current time or scheduled cutoff.
- In ACCRUE, it records the caller’s cutoff weight before reducing principal.
- It asks the confidential token to transfer the requested encrypted principal and subtracts the token’s returned encrypted transferred amount.
- It then marks exitRequested and records the current draw, regardless of whether the returned transfer was zero.

Code evidence: [MixTogetherPool.sol:142-163](../packages/contracts/contracts/MixTogetherPool.sol#L142-L163). The intended backing invariant is documented in [docs/architecture.md:25-36](architecture.md#L25-L36), but the contract does not independently prove that the wrapper returned a positive transfer before marking the exit.

#### TWAB-like accumulation

The current implementation stores private principal, balanceSeconds, and drawWeight. It computes:

~~~text
elapsed = end - lastAccrual
ticketUnits = floor(principal / TICKET_UNIT)
balanceSeconds += ticketUnits × elapsed
~~~

The fixed TICKET_UNIT is 100,000 base units. At cutoff, _recordWeight snapshots the private balance-seconds into draw weight, adds it to encrypted total weight, and resets the running balance-seconds. Code evidence: [MixTogetherPool.sol:398-422](../packages/contracts/contracts/MixTogetherPool.sol#L398-L422).

This is a quantized balance-seconds accumulator, not a full historical share observation ring buffer. Small balances can have zero ticket units, and the state is updated only when a deposit, withdrawal, or draw batch touches the account.

#### Prize funding

Prize mode is a cUSDC callback with PRIZE = 2. The encrypted amount is added to _prizeReserve; no vault deposit, share-price change, strategy harvest, liquidation, or positive-yield proof occurs. Code evidence: [MixTogetherPool.sol:126-133](../packages/contracts/contracts/MixTogetherPool.sol#L126-L133).

#### Randomization

After all 64 accrual slots have been scanned, randomizeDraw reserves min(_prizeReserve, NOMINAL_PRIZE), subtracts it from reserve, multiplies an encrypted 64-bit FHE random word by encrypted total weight in euint128, and shifts right by 64 bits to create an encrypted ticket. Code evidence: [MixTogetherPool.sol:213-235](../packages/contracts/contracts/MixTogetherPool.sol#L213-L235) and the overridable FHE randomness source at [MixTogetherPool.sol:516-518](../packages/contracts/contracts/MixTogetherPool.sol#L516-L518).

#### Winner selection

The selection pass walks the public saver array, computes a private cumulative interval, privately checks whether the encrypted ticket falls in that interval, and conditionally adds the active award to the saver’s encrypted winnings. Every visited saver gets a newly written winnings handle. It terminates only after the selection cursor reaches 64. Code evidence: [MixTogetherPool.sol:237-256](../packages/contracts/contracts/MixTogetherPool.sol#L237-L256) and [MixTogetherPool.sol:424-446](../packages/contracts/contracts/MixTogetherPool.sol#L424-L446).

#### Claiming

claimWinnings transfers the caller’s encrypted winnings, subtracts the token’s returned actual transfer, persists the remainder, and permits a zero-value claim. Code evidence: [MixTogetherPool.sol:165-177](../packages/contracts/contracts/MixTogetherPool.sol#L165-L177). The zero-value behavior is covered by [MixTogetherPool.ts:508-536](../packages/contracts/test/MixTogetherPool.ts#L508-L536), so a claim call is not proof of winning.

#### Pruning

An exited slot is pruned only in OPEN, only when the current draw is greater than the recorded exit draw, and only in batches of at most eight supplied slots. Pruning clears the public slot and exit markers but does not clear the private winnings mapping. Code evidence: [MixTogetherPool.sol:258-283](../packages/contracts/contracts/MixTogetherPool.sol#L258-L283).

That asymmetry creates the critical re-registration defect below: after pruning, the same address can register again and _register overwrites its old encrypted winnings with a fresh encrypted zero.

#### Frontend state and UX

The browser:

- reads public drawState, public mock-USDC balance, and encrypted cUSDC/principal/winnings handles every 12 seconds;
- uses wagmi/viem and the Zama React SDK;
- asks for an EIP-712 permit before decrypting three values in the browser;
- stores Zama permit credentials in session storage and clears private query cache on account/chain change;
- stores pending public unwrap request IDs in local storage and rediscovers recent logs;
- exposes public saver count and /64 progress, while hiding private weights, odds, ticket, reserve, selected interval, and winner result;
- allows any connected user to advance the draw when the phase permits it.

Code evidence: imports and providers at [App.tsx:1-66](../apps/web/src/App.tsx#L1-L66), read model at [App.tsx:107-141](../apps/web/src/App.tsx#L107-L141), cache reset and unwrap recovery at [App.tsx:143-191](../apps/web/src/App.tsx#L143-L191), and transaction actions at [App.tsx:227-310](../apps/web/src/App.tsx#L227-L310). The private values are decrypted in [PrivateBalances.tsx:14-43](../apps/web/src/components/PrivateBalances.tsx#L14-L43). Wallet connection is currently the first injected wagmi connector at [WalletButton.tsx:4-27](../apps/web/src/components/WalletButton.tsx#L4-L27).

The UI explicitly labels addresses, registry membership, transaction timing, shield/unshield amounts, and claim/withdrawal calls as public. It says that a zero claim does not prove a win and that wallet anonymity is not provided.[^repo-readme]

#### Keeper and liveness

The keeper reads the phase and latest block timestamp, submits exactly one next action, waits for confirmation, and optionally sleeps for 12 seconds. It has one configured private key and no incentive market, quorum, lease, reorg policy, stale-draw alarm, or guaranteed service level. Code evidence: [keeper.ts:13-26](../packages/contracts/scripts/keeper.ts#L13-L26) and [keeper.ts:28-67](../packages/contracts/scripts/keeper.ts#L28-L67).

### 4.3 Findings by severity

Severity describes the current implementation, not the proposed Midnight design. “Critical” means direct loss or permanent loss of a user liability under an ordinary permitted flow. “High” includes denial of service, missing economic correctness, material privacy/trust gaps, or liveness failures. “Medium” includes conditional loss, bias, governance, arithmetic, or coverage risk.

| Severity | Finding and category | Exact evidence | Impact and disposition |
| --- | --- | --- | --- |
| **Critical** | Re-registration overwrites unclaimed winnings. **Exploitable defect.** | `pruneExited` clears `slotOf[saver]` at [MixTogetherPool.sol:273-280](../packages/contracts/contracts/MixTogetherPool.sol#L273-L280). A subsequent deposit enters `_register` at **[MixTogetherPool.sol:376](../packages/contracts/contracts/MixTogetherPool.sol#L376)** (function body [MixTogetherPool.sol:376-383](../packages/contracts/contracts/MixTogetherPool.sol#L376-L383)); that body overwrites `_winnings[saver]` with `_zeroFor(saver)` at [MixTogetherPool.sol:387-391](../packages/contracts/contracts/MixTogetherPool.sol#L387-L391). | A user can withdraw, wait for pruning, and deposit again before claiming old winnings. The new registration destroys the old encrypted winnings handle/value. Freeze the legacy migration path around this defect; do not patch by translating ciphertexts. Legacy claims must remain available until an explicit fix or sunset procedure is deployed. |
| **High** | Encrypted-zero registry exhaustion. **Exploitable denial of service / design defect.** | onConfidentialTransferReceived cannot branch on a private amount and calls _receiveDeposit for mode 1 at [MixTogetherPool.sol:117-140](../packages/contracts/contracts/MixTogetherPool.sol#L117-L140). _receiveDeposit registers before adding the amount at [MixTogetherPool.sol:360-369](../packages/contracts/contracts/MixTogetherPool.sol#L360-L369). The security policy acknowledges that an encrypted zero can register a saver at [SECURITY.md:16-18](../SECURITY.md#L16-L18). | Distinct zero-effective deposits consume public slots. The 65th saver reverts, as tested at [MixTogetherPool.ts:690-735](../packages/contracts/test/MixTogetherPool.ts#L690-L735). A Midnight deposit circuit must prove a positive amount/share delta before creating a note or consuming a registration leaf. |
| **High** | Fixed 64-user capacity and manual pruning. **Accepted demo constraint with DoS impact.** | MAX_SAVERS = 64 and BATCH_SIZE = 8 at [MixTogetherPool.sol:29-35](../packages/contracts/contracts/MixTogetherPool.sol#L29-L35); storage is address[MAX_SAVERS] at [MixTogetherPool.sol:47-55](../packages/contracts/contracts/MixTogetherPool.sol#L47-L55); pruning accepts caller-supplied slots at [MixTogetherPool.sol:258-283](../packages/contracts/contracts/MixTogetherPool.sol#L258-L283). | Capacity is incompatible with the roughly 1,000-user target. The replacement uses append-only commitment trees and does not reclaim an array slot. |
| **High** | Globally linear two-pass draw processing. **Scalability/design gap.** | Accrual advances a cursor to 64 at [MixTogetherPool.sol:193-210](../packages/contracts/contracts/MixTogetherPool.sol#L193-L210); selection does the same at [MixTogetherPool.sol:238-255](../packages/contracts/contracts/MixTogetherPool.sol#L238-L255). The local test only proves eight occupied slots per transaction and then exhausts the 64-slot cursor at [MixTogetherPool.ts:466-506](../packages/contracts/test/MixTogetherPool.ts#L466-L506). | Each draw remains globally dependent on all slots, including empty slots. A 1,000-user circuit cannot be obtained by merely raising the batch size. The replacement has one-user proof work and public root updates only. |
| **High** | Keeper-dependent liveness; deposits are blocked by a stalled draw. **Operational risk / availability defect.** | Deposits require OPEN at [MixTogetherPool.sol:360-364](../packages/contracts/contracts/MixTogetherPool.sol#L360-L364); the state machine returns to OPEN only in _finalizeDraw at [MixTogetherPool.sol:448-474](../packages/contracts/contracts/MixTogetherPool.sol#L448-L474). The keeper is an optional single-key poller at [keeper.ts:13-26](../packages/contracts/scripts/keeper.ts#L13-L26). | If the draw stalls in ACCRUE, RANDOMIZE, or SELECT, deposits revert until someone advances it. Preprod needs an incentivized draw-completion path, watchdogs, and recovery calls. Production needs stronger automation and emergency exit semantics. |
| **High** | Prize reserve is donated, not generated from yield. **Economic/design gap.** | Prize mode directly adds cUSDC to _prizeReserve at [MixTogetherPool.sol:130-133](../packages/contracts/contracts/MixTogetherPool.sol#L130-L133). The current fixed reserve and nominal award are documented at [README.md:25-38](../README.md#L25-L38). | The product is not yet a genuine prize-savings pool. The replacement must source every prize budget from positive realized external strategy yield and reject simulated interest or donated prizes. |
| **High** | Public saver addresses and timing. **Privacy leakage.** | The public saver array and mappings are at [MixTogetherPool.sol:47-55](../packages/contracts/contracts/MixTogetherPool.sol#L47-L55); address/progress events are at [MixTogetherPool.sol:84-95](../packages/contracts/contracts/MixTogetherPool.sol#L84-L95); the UI publishes /64 occupancy and phase progress at [App.tsx:415-429](../apps/web/src/App.tsx#L415-L429). | Observers can enumerate participants, timing, exits, and phase activity. Midnight hides owner identity behind commitments at the protocol layer, but source-chain entry/exit and network-level transaction metadata remain visible. |
| **High** | Opaque FHE winner computation and FHE gateway/KMS availability. **Trust/operational risk.** | Winner state is produced through encrypted FHE operations at [MixTogetherPool.sol:213-235](../packages/contracts/contracts/MixTogetherPool.sol#L213-L235) and [MixTogetherPool.sol:424-446](../packages/contracts/contracts/MixTogetherPool.sol#L424-L446). The frontend depends on Zama relayer configuration at [config.ts:30-39](../apps/web/src/lib/config.ts#L30-L39), and its error path names relayer/KMS unavailability at [transaction.ts:48-50](../apps/web/src/lib/transaction.ts#L48-L50). | Users cannot independently verify a public randomness transcript or global winning computation. The replacement uses public EVM VRF plus a signed draw attestation, while private win eligibility is verified by a user-generated proof. Local proof availability becomes a user-controlled dependency rather than a remote KMS dependency. |
| **Medium** | Withdrawal marks exit even when confidential transfer returns zero. **Conditional exploitable defect.** | The contract subtracts returned transferred at [MixTogetherPool.sol:151-158](../packages/contracts/contracts/MixTogetherPool.sol#L151-L158), then unconditionally sets exit markers at [MixTogetherPool.sol:159-160](../packages/contracts/contracts/MixTogetherPool.sol#L159-L160). | A short-liquidity or malicious wrapper could leave principal while making the slot prune-eligible after the draw. The current stock wrapper/backing tests reduce the expected path, but this is an unsafe assumption. Replacement withdrawal proofs must consume only the proven note amount and create a settlement claim that cannot strand the note. |
| **Medium** | Quantized weights. **Economic/design gap.** | TICKET_UNIT = 100,000 at [MixTogetherPool.sol:31-35](../packages/contracts/contracts/MixTogetherPool.sol#L31-L35), and FHE.div(principal, TICKET_UNIT) at [MixTogetherPool.sol:416-419](../packages/contracts/contracts/MixTogetherPool.sol#L416-L419). | Balances below one unit contribute zero and all balances lose a fractional remainder. The replacement uses exact share-based TWAB arithmetic with explicit integer rounding tests. |
| **Medium** | Accepted-range bias. **Cryptographic/economic quality risk.** | The current range mapping is floor(random × totalWeight / 2^64) at [MixTogetherPool.sol:222-226](../packages/contracts/contracts/MixTogetherPool.sol#L222-L226). The project security policy records non-zero bias unless total weight divides 2^64 at [SECURITY.md:16-20](../SECURITY.md#L16-L20). | Use PoolTogether-style winning zones and unbiased/rejection-safe PRN reduction in the replacement. Document the residual integer policy and test boundary values. |
| **Medium** | Single-guardian controls. **Governance risk.** | The pool is Ownable2Step with one guardian at [MixTogetherPool.sol:16-20](../packages/contracts/contracts/MixTogetherPool.sol#L16-L20); pause is owner-only at [MixTogetherPool.sol:285-293](../packages/contracts/contracts/MixTogetherPool.sol#L285-L293). Rotation is two-step but still single-owner at [MixTogetherPool.sol:352-358](../packages/contracts/contracts/MixTogetherPool.sol#L352-L358). | A single key can pause deposits and controls reserve visibility/ACL rotation. Preprod uses a 2-of-3 attestor committee plus a narrowly scoped emergency authority; production requires audited governance and rotation. |
| **Medium** | Arithmetic-bound assumptions. **Correctness risk.** | Balance updates use euint64 addition/multiplication at [MixTogetherPool.sol:416-420](../packages/contracts/contracts/MixTogetherPool.sol#L416-L420), while random range uses euint128 multiplication at [MixTogetherPool.sol:222-226](../packages/contracts/contracts/MixTogetherPool.sol#L222-L226). | The current tests are example-sized and do not establish long-inactivity, maximum-share, maximum-duration, or compounded transition safety. Compact spikes must use explicit ranges, checked subtraction, and overflow-bound properties. |
| **Medium** | Missing live tail-batch, concurrency, and wallet-extension coverage. **Verification gap.** | The strongest batch test covers exactly eight occupied slots and cursor exhaustion at [MixTogetherPool.ts:466-506](../packages/contracts/test/MixTogetherPool.ts#L466-L506). Current web configuration assumes one injected connector at [config.ts:23-28](../apps/web/src/lib/config.ts#L23-L28); the repository’s local tests do not exercise the proposed Midnight provider, proof-server, private-state restore, or concurrent source batches. | The green suite is necessary but insufficient for the 1,000-user target. These scenarios are explicit acceptance gates in §14. |

### 4.4 Findings separated by type

#### Exploitable defects

- Re-registration can destroy unclaimed winnings after a slot is pruned.
- An encrypted-zero callback can consume a registry slot.
- A zero-return withdrawal can be marked exited while retaining a private principal balance.

#### Economic and design gaps

- The reserve is donated rather than yield-generated.
- Quantized ticket units alter relative odds and zero out small balances.
- The current integer range mapping has non-zero bias.
- Exact-one-winner selection requires a global scan and cannot scale to the target population.

#### Accepted demo constraints

- 64 public slots and eight occupied slots per encrypted batch.
- Five-minute epochs and a nominal fixed award.
- Mock USDC/cUSDC and a manually funded reserve.
- A permissionless but un-incentivized keeper.
- Local FHEVM HCU tests and one bounded Sepolia smoke rather than production-scale load.

These constraints are acceptable only as demo properties. They are not carried into the Midnight target.

#### Privacy leakage

- Wallet addresses, registry membership, transaction timing, phase progress, and shield/unshield amounts are public.
- A claim or withdrawal call is public even when its amount is encrypted.
- FHE hides values from ordinary chain observers but does not make participation anonymous.
- The EVM source-chain user, amount, and timing remain a deliberate privacy boundary in the replacement.

#### Operational risks

- FHE relayer/KMS or FHE coprocessor unavailability.
- Keeper absence or a phase stalled before OPEN.
- Async public unwrap pending during gateway outage.
- Manual pruning and a full registry.
- One guardian key and no production governance quorum.
- No bridge finality, reorg, attestation, strategy-liquidity, or sponsor-abuse controls in the current demo.

## 5. FHE-to-ZK feasibility

### 5.1 The models are materially different

FHEVM and Midnight both hide values, but they put the computation and availability burden in different places.

| Dimension | Current FHEVM model | Midnight target model |
| --- | --- | --- |
| Private state | Encrypted values are stored and transformed by the contract/FHE execution environment. | The user keeps private account state locally; the chain stores commitments, roots, public draw data, and nullifiers. |
| Global computation | The contract can add encrypted balances, accumulate encrypted totals, derive an encrypted ticket, and scan encrypted intervals. | A circuit proves a user’s own note transition, Merkle membership, TWAB, and claim predicate. There is no private global participant scan. |
| Witness/proof origin | FHE handles and relayer/KMS/coprocessor execution. | User-generated witness and proof, by default through a local proof server. |
| Public verifiability | Ciphertext operation results are not a public cleartext audit transcript. | Public randomness, roots, nullifiers, commitments, and proof verification are auditable; private values remain hidden. |
| Scaling shape | Work grows with encrypted global state and circuit/HCU operation count. | Work grows with one user’s note and Merkle path; tree history and batch roots grow append-only. |
| Failure mode | Remote FHE gateway/KMS/coprocessor outage can block private operations. | User proof server/private-state loss can block that user; public settlement can continue and recovery uses encrypted backups. |

Midnight’s security guidance makes the boundary explicit: contract/circuit calls, disclosed arguments, timing, and ledger updates are public, while private witness inputs and internal computation remain hidden.[^2] It also warns that ownPublicKey() is prover-controlled and must not be used as authentication; identity must be derived from a secret and bound to a commitment.[^2]

### 5.2 Why the exact one-winner scan does not port directly

The current FHE algorithm is:

~~~text
private totalWeight = Σ private userWeight
private ticket = range(private random, private totalWeight)
for every registered user:
    private interval = [cumulative, cumulative + userWeight)
    private selected = ticket ∈ interval
~~~

On Midnight, a user can prove “my note is in the tree, my private TWAB is correct, and my PRN is inside my winning zone.” The protocol cannot also prove “no other one of 1,000 users won” without one of the following compromises:

- aggregating all users’ private claims into a global operator computation;
- publicly enumerating or proving every eligible note and every interval;
- adding a trusted aggregator or a recursive global proof pipeline;
- accepting a public winner set, which links identity or timing;
- forcing every user to submit a claim proof, recreating a global liveness and cost problem.

Each option reintroduces aggregation, privacy leakage, a trusted operator, or global scalability cost. Therefore the target changes the invariant rather than pretending the FHE loop is a local ZK circuit. It publishes a random draw and a winning-zone rule, and lets each user privately test their own eligibility. The public state records only winning commitments, nullifiers, count, and budget.

### 5.3 Feasibility conclusion

The architecture is feasible if the following can be demonstrated in isolated compile-verified spikes:

1. A note transition can consume an old commitment/nullifier, prove a private TWAB transition, and insert a replacement commitment without an all-user loop.
2. A private win circuit can verify a historical root, secret-derived owner commitment, finalized draw data, private TWAB, domain-separated PRN, and winning-zone predicate.
3. A draw can accept a 2-of-3 attestation with exact domain binding, threshold checking, nonce/expiry/replay protection, and no block-time entropy.
4. A private-state backup can restore all witnesses needed for a pending deposit, withdrawal, eligibility receipt, and prize redemption.
5. Proof and sponsor p95s meet the §14 budget at 1,000 accounts and 10,000 historical commitments.

Failure of any item leaves preprod no-go. No amount of UI work substitutes for the compile and property evidence.

## 6. PoolTogether V5 comparison

PoolTogether’s official design describes a prize-savings model built around Prize Vaults, ERC-4626 yield vaults, TWAB historical balances, yield liquidation, public verifiable randomness, probabilistic winning zones, and incentivized claims.[^1]

| PoolTogether V5 motif | MixTogether decision | Rationale |
| --- | --- | --- |
| Prize Vault deposits into an ERC-4626 yield vault | **Adopt.** YieldVaultRouter uses one audited ERC-4626 strategy. | Makes “prize savings” real and gives the EVM plane a clear custody/accounting boundary. |
| Principal remains withdrawable while yield funds prizes | **Adopt with explicit risk qualification.** | Principal is never reclassified as prize liquidity, but strategy, bridge, and liquidity risk still require acceptance. No-loss language is withheld until those risks are proven. |
| TWAB observations and cumulative balance-seconds | **Adopt conceptually; change storage.** | Use exact share-based balance-seconds in private account notes and eligibility receipts rather than a public participant array or a mutable global encrypted map. |
| Yield liquidation and a prize contribution | **Adopt; simplify.** | Harvest only positive realized yield into a fixed draw budget. No mocked accrual, guardian donation, or unbounded prize reserve. |
| Public verifiable RNG | **Adopt.** | Chainlink VRF v2.5 on the external EVM chain supplies randomness; the DrawAttestation authenticates it on Midnight. PoolTogether’s public RNG principle is preserved. |
| Winning zones and PRN per draw/vault/user/tier/index | **Adopt; make user-private.** | A user derives a domain-separated PRN from the public randomness and their private secret. The proof reveals neither identity nor private TWAB. |
| Exact one selected interval | **Intentionally change.** | A global exact selection scan cannot port to user-local proving at 1,000 users. Zero or multiple winners are valid. |
| Multiple prize tiers, adaptive/reserve logic | **Intentionally simplify for MVP.** | One tier, expected count one, fixed harvested budget, pro-rata payout. Add tiers only after the one-tier proof and economics are stable. |
| Incentivized draw completion and claims | **Adopt.** | Permissionless action alone is insufficient. Preprod uses sponsor/keeper quotas and explicit incentives; production requires monitored liveness and claim relaying. |
| Leftover prize recycling | **Adopt.** | Zero-winner budgets roll forward. Pro-rata rounding remainder stays in yield reserve. No liability may exceed harvested yield. |
| Public EVM vault and protocol state | **Change boundary.** | EVM custody, VRF, and settlement are public. Private principal, TWAB, winning identity, and unredeemed winnings live behind Midnight commitments/proofs. |

## 7. Target architecture

### 7.1 Plane separation

~~~text
                         public custody / randomness / settlement
  Stablecoin ───────► EVM YieldVaultRouter
                             │
             ERC-4626 shares│ positive realized yield
                             │ VRF request/finalization
                             │ finalized batch commitments
                             ▼
                     2-of-3 preprod attestors
                             │ signed, domain-bound attestations
                             ▼
                   Midnight PrivatePrizeVault
                    │ public roots/nullifiers/draw state
                    │ private notes and local proofs
                    ▼
               shielded winnings / withdrawal claims
~~~

EVM contains no private accounting and no global winner computation. Midnight contains no direct unverified instruction to move EVM money. Cross-chain messages are accepted only after finality and valid attestation. EffectStream can index and correlate public state for a read model, but no EffectStream response can authorize a deposit, withdrawal, harvest, or prize payment.[^5]

### 7.2 External yield plane: YieldVaultRouter

#### Responsibilities

The Solidity router is an explicit custody boundary around one fixed stablecoin and one exact ERC-4626 strategy:

- accept stablecoin deposits and issue/record strategy shares;
- maintain public total-share and batch accounting;
- expose finalized deposit and withdrawal roots;
- record strategy assets, share price, positive realized yield, and pending exits;
- harvest only positive yield after a strategy-specific solvency and liquidity check;
- request and finalize VRF randomness for a draw;
- publish a source-chain draw/batch reference that the attestor committee can sign;
- process exits only against a finalized Midnight withdrawal claim;
- pause new deposits without disabling emergency withdrawals or queued exits.

The router is not itself the strategy. It must bind the exact strategy address, asset address, chain ID, implementation/version hash, decimals, and allowed ERC-4626 methods. It must reject an unexpected asset, share conversion, callback sender, or strategy upgrade. The router requires its own independent audit even if the underlying strategy is audited.

#### Selected strategy candidate

| Candidate | Official deployment/integration evidence | Audit evidence | Risks and decision |
| --- | --- | --- | --- |
| **Spark Vaults V2 spUSDC** | Spark’s official integrator guide documents the vault as ERC-4626 and lists spUSDC with USDC asset address 0x28B3a8fb53B741A8Fd78c0fb9A6B2393d896a43d.[^7] Spark’s official address registry names the same SPARK_VAULT_V2_SPUSDC deployment and the V2 implementation.[^8] | Spark’s official security page links the Savings audits, including versioned Cantina and ChainSecurity reports for V1.0.0 and V1.0.1.[^9] | **Selected reference strategy.** Official material also documents upgradeability, PSM/liquidity constraints, and withdrawal liquidity considerations. The exact first-party preprod deployment was not verified in this evidence pass; preprod is no-go until it is. The router must bind the audited version/address and monitor previewRedeem, maxWithdraw, idle liquidity, and upgrade/admin events. |
| Morpho Vault V2 | Morpho documents Vault V2 as an ERC-4626 permissionless vault framework with adapters, roles, caps, and timelocks; its API documents deployment discovery.[^10] | ChainSecurity publishes an official Morpho Vault V2 audit report.[^11] | Strong alternative, but no exact first-party preprod stablecoin deployment satisfying this RFC was verified here. Do not substitute a community deployment or fork for the selected path. |

The selection is therefore **Spark spUSDC as the strategy reference**, conditional on the exact environment deployment. This does not mean “use mainnet spUSDC on preprod” or “assume a test deployment exists.” The preprod release artifact must record the exact chain/address/implementation and show real positive accrual. If the official deployment is unavailable, stop at the gate; do not add simulated interest or a donated prize reserve.

#### Router accounting and invariants

Use public integer accounting with a clear separation between principal liabilities and harvested yield:

~~~text
strategyAssets = previewRedeem(routerStrategyShares)
positiveYield   = max(0, strategyAssets - principalLiability - alreadyEarmarkedYield)
prizeBudget     = harvestedPositiveYield not yet allocated or paid
~~~

The actual implementation must account for strategy fees, rounding, pending withdrawals, and unsettled bridge batches explicitly. positiveYield is not minted by the router; it is harvested from realized strategy assets and transferred or earmarked only after the router can prove the strategy-side state.

Required invariants:

- principalLiability is never reduced merely to create prize liquidity.
- prizeLiability <= cumulativeHarvestedPositiveYield.
- Negative strategy performance creates no new prize budget.
- A withdrawal batch cannot be finalized twice.
- A deposit or withdrawal leaf cannot be consumed twice on Midnight.
- previewRedeem and maxWithdraw are checked before accepting an exit; a liquidity shortfall creates a queued exit rather than a false completion.
- Strategy upgrades, implementation changes, and admin changes pause new deposits until revalidated.

#### Router interface sketch

The following is an interface contract, not final Solidity syntax:

~~~solidity
interface IYieldVaultRouter {
    function deposit(uint256 assets, bytes32 recipientCommitment) external returns (uint64 batchId);
    function finalizeDepositBatch(uint64 batchId) external;
    function requestWithdrawal(bytes32 withdrawalCommitment, uint256 shares) external returns (uint64 batchId);
    function finalizeWithdrawalBatch(uint64 batchId) external;
    function harvestPositiveYield() external returns (uint256 realizedYield);
    function requestDrawRandomness(uint64 drawId) external returns (uint256 requestId);
    function finalizeDrawRandomness(uint64 drawId, uint256 requestId) external;
    function emergencyPauseDeposits() external;
    function resumeDeposits() external;
}
~~~

Events must include the source chain/domain, router address, batch/draw ID, root, aggregate shares/assets, finalized block, strategy version, and nonce. Per-user source-chain amounts and addresses are public by design; the root provides a stable cross-chain reference, not anonymity.

### 7.3 Public verifiable randomness

Use Chainlink VRF v2.5 on the external EVM chain. Chainlink documents VRF as verifiable random data and publishes supported networks/coordinator configuration; its Ethereum Sepolia entry includes the coordinator and LINK token addresses.[^12] The exact coordinator, key hash, subscription, callback gas limit, and confirmation count are deployment parameters recorded in the router config.

Randomness rules:

- request randomness only after the draw cutoff is fixed;
- bind the request to sourceChainId, router address, draw ID, and nonce;
- accept only the finalized VRF response for the exact request;
- wait for the configured source finality depth before attestation;
- include the randomness and source references in DrawAttestation;
- never derive entropy from Midnight block time, transaction ordering, attestor choice, or a keeper-selected word.

### 7.4 Cross-chain security plane

#### Preprod committee

Preprod uses three named secp256k1 attestors with a 2-of-3 threshold. Attestors independently observe finalized EVM blocks and sign a canonical message. A valid message requires:

~~~text
domain = H(
  "MixTogether/Attestation/v1",
  sourceChainId,
  destinationDomain,
  sourceContract,
  destinationContract,
  messageKind
)

message = H(
  domain,
  finalizedBlockHash,
  batchOrDrawId,
  nonce,
  expiry,
  commitmentRoot,
  aggregateAmountOrShares,
  sourceReference
)
~~~

The target must reject duplicate signers, wrong domains, wrong contracts, expired messages, stale finality, duplicate (kind, id, nonce), and aggregate mismatches. Committee rotation is a public state transition with a timelock and an overlap period; the old and new quorum must be unambiguous at each block.

The Compact feasibility spike must confirm that the selected secp256k1 verification path is compile-verified and within the proof budget. If it is not, the preprod implementation must use a narrowly scoped, separately audited message-verification component; it may not silently trust an indexer or EffectStream.

#### Production boundary

Production requires either:

- an audited trust-minimized bridge with independently verifiable messages and finality; or
- an independently verified message path whose correctness does not depend on two honest members of an operator committee.

The 2-of-3 committee is not a production bridge.

### 7.5 Midnight public ledger and private state

PrivatePrizeVault.compact has public state for protocol progress and replay protection, and private account state held by users.

Public state includes:

- current draw ID and phase;
- accepted draw cutoff and attestation hash;
- append-only account, eligibility, winning-ticket, deposit, and withdrawal roots;
- accepted historical roots;
- public nullifier sets, domain-separated by operation;
- finalized batch IDs and aggregate share totals;
- public total-share TWAB committed by the draw attestation;
- harvested-yield budget, registered winner count, and claim liability;
- pause state, authority/attestor set, nonce, and expiry state.

There is no participant array, public address-to-account mapping, or circuit loop over all users. A root append is O(1) public ledger work; a user proof is O(log N) membership work for the relevant tree.

#### Private data structures

The following structures are logical interfaces. Their exact Compact representation must be fixed by the compile spike.

| Structure | Required fields | Visibility and purpose |
| --- | --- | --- |
| AccountNote | ownerCommitment, private principalShares, private accumulatedBalanceSeconds, private lastUpdate, drawId, nonce, salt | The encrypted/local note held by the user. Its commitment is inserted into the append-only account tree. |
| EligibilityReceipt | ownerCommitment, drawId, private finalizedTwab, salt | A private receipt preserving eligibility for the immediately preceding draw before a post-cutoff balance change. Its commitment is inserted into the eligibility tree. |
| WinningTicket | drawId, ownerCommitment, redemptionSecret, salt | A private winning claim witness. Its commitment is public; the redemption secret and owner binding remain private. |
| BridgeBatch | sourceDomain, batchId, depositRoot or withdrawalRoot, aggregateShares, finalizedBlock, attestation | Public cross-chain evidence proving that a private note may be created or an exit may be settled. |
| DrawAttestation | cutoff, public totalShareTwab, harvestedYieldBudget, randomness, sourceReferences, nonce | Public draw input authenticated by the EVM VRF and attestor quorum. |

Owner commitments must be derived from a secret with a domain separator and salt. A prover-controlled public key is not an identity proof. Historic Merkle paths must bind their leaf to the secret-derived owner commitment; otherwise an observed path can be replayed against another witness.[^2]

### 7.6 Nullifier and commitment model

Each consuming transition uses a domain-separated nullifier:

~~~text
noteNullifier  = H("MixTogether/nullifier/account", ownerSecret, noteCommitment, nonce)
depositNullifier = H("MixTogether/nullifier/deposit", sourceDomain, batchId, leafIndex)
drawWinNullifier = H("MixTogether/nullifier/win", drawId, ownerSecret, noteCommitment)
redeemNullifier = H("MixTogether/nullifier/redeem", drawId, winningCommitment, redemptionSecret)
withdrawNullifier = H("MixTogether/nullifier/withdraw", withdrawalCommitment, nonce)
~~~

The contract stores only whether a nullifier has been used. Nullifier domains must not be reused as commitment domains, and the design must avoid making a commitment and nullifier linkable by construction.[^2]

State transition pattern:

~~~text
prove previous commitment + historic root + secret
assert leaf.ownerCommitment == deriveOwnerCommitment(secret, salt)
assert operation-specific nullifier is unused
mark nullifier used
insert replacement commitment or operation commitment
~~~

The old note is never mutated in place. A failed proof changes nothing. A successful proof consumes exactly one prior state and creates exactly one successor/claim reference.

## 8. Compact circuits and protocol interfaces

The names below are locked for the architecture spike. Public arguments, private witnesses, state transitions, and error behavior must be documented in the generated Compact interface before frontend work starts.

| Circuit/interface | Public inputs | Private witness/proof | Required transition and invariant |
| --- | --- | --- | --- |
| claimDeposit | Valid BridgeBatch, deposit leaf index, current deposit root, target draw/nonce | Deposit leaf secret, owner secret, share amount, Merkle path | Verify 2-of-3 attestation, finalized block/root, positive share amount, unused deposit nullifier; insert one AccountNote commitment. A batch leaf cannot be claimed twice. |
| updateAccount | Previous root, effective timestamp, new commitment, operation nonce | Previous AccountNote, owner secret, Merkle path, new private share/balance values | Prove note ownership, previous nullifier unused, monotonic time, bounded arithmetic, and correct private balance-seconds transition; consume old note and insert replacement. |
| requestWithdrawal | Withdrawal commitment, batch/root reference, effective timestamp | Account note, owner secret, Merkle path, shares to exit | Prove the note and exact shares, preserve any pre-cutoff eligibility receipt, consume the note transition, and create one withdrawal commitment. Never mark an exit without a proven value-bearing transition. |
| closeDraw | Draw ID, cutoff, current phase, public time/deadline | None beyond authority/phase witness | Accept only after the authenticated cutoff and exact state phase. It freezes eligibility inputs; it does not generate randomness. |
| publishDraw | DrawAttestation, VRF source reference, draw ID | None, or signature witnesses if verification is circuit-local | Verify source chain/router, finality, attestor threshold, nonce/expiry, cutoff, public total-share TWAB, harvested budget, and randomness. Set the public draw input exactly once. |
| registerWin | Draw ID, public draw attestation hash, current eligibility root, winning commitment | Eligibility receipt, owner secret, note/receipt path, salt, redemption secret | Prove note ownership, correct private TWAB, draw membership, domain-separated PRN, and that the user-derived PRN lies inside the PoolTogether-style winning zone. Consume a draw-scoped nullifier and insert one winning commitment. No identity or private TWAB is disclosed. |
| finalizeClaims | Draw ID, registration-window close, registered winner count, harvested budget | None | Close registration once. If count is zero, roll the entire budget forward. Otherwise set unitPayout = floor(budget / count) and liability = count × unitPayout; assert liability ≤ budget. Remainder stays reserve. |
| redeemPrize | Draw ID, winning root, winning commitment, current account root | Winning ticket, redemption secret, owner secret, Merkle paths | Prove winning commitment ownership and unused redemption nullifier; consume it and merge the fixed payout into private winnings or a withdrawal claim. |
| pauseDeposits | Authority, current nonce, reason/expiry | Authority signature or governance proof | Stop new deposit claims only. Existing notes, claims, and emergency exits remain possible unless a separately audited circuit proves a system-wide emergency condition. |
| resumeDeposits | Authority rotation state and nonce | Authority signature/governance proof | Resume only after the pause reason is cleared and attestor/strategy health checks are recorded. |
| rotateAuthority / rotateAttestors | New set, threshold, effective height, expiry/overlap | Current authority proof and rotation authorization | Use timelock/overlap rules; reject ambiguous signer sets and replayed rotations. |

### 8.1 TWAB transitions

Use exact share-based balance-seconds, with integer bounds explicit in the circuit:

~~~text
deltaSeconds       = effectiveTime - note.lastUpdate
newBalanceSeconds  = note.accumulatedBalanceSeconds
                   + note.principalShares × deltaSeconds
~~~

The circuit must prove:

- effectiveTime >= lastUpdate;
- effectiveTime <= the authenticated draw cutoff for an eligibility receipt;
- deltaSeconds and the product fit the chosen bounded integer representation;
- shares are not silently truncated;
- an exact cutoff transition is deterministic;
- a zero-share note cannot create positive TWAB;
- post-cutoff withdrawal first creates the preceding draw’s EligibilityReceipt, then changes the account note.

The draw attestation’s public totalShareTwab is a source/accounting cross-check, not a replacement for the user’s private receipt. Its relationship to the sum of eligible private receipts is tested statistically/property-wise and reconciled against the bridge batch and router share records.

### 8.2 Winning zone and PRN

For the single MVP tier, the public draw provides randomness, totalShareTwab, and a fixed expected winner count parameter. For each user:

~~~text
prn = H("MixTogether/prn/v1", randomness, drawId, ownerSecret, salt)
zone = boundedWinningZone(privateTwab, totalShareTwab, expectedWinnerCount)
win  = unbiasedReduce(prn, publicSupply) < zone
~~~

The exact fixed-point formula and scaling constant are implementation parameters, but the proof must establish:

- 0 <= zone <= publicSupply;
- zone is monotonically related to the user’s eligible private TWAB;
- zone is zero for ineligible/zero-TWAB receipts;
- expected total winners is approximately one over the configured population;
- unbiasedReduce uses rejection sampling or an equivalent bias-bounded method;
- no user can choose the randomness, draw ID, owner secret, or salt after seeing a winning result;
- a draw-scoped nullifier permits at most one registration for the same account and draw.

The protocol does not promise exactly one winner. It promises only that every accepted registration passed the same public draw and private proof predicate.

### 8.3 Payout and rollover

After the registration window:

~~~text
if winnerCount == 0:
    rollover = harvestedYieldBudget
    unitPayout = 0
else:
    unitPayout = floor(harvestedYieldBudget / winnerCount)
    liability = unitPayout × winnerCount
    rollover = harvestedYieldBudget - liability
~~~

finalizeClaims sets liability once and proves liability <= harvestedYieldBudget. rollover remains part of the next draw’s yield budget. There is no path that converts principal shares into prize budget, even if the strategy has negative performance or withdrawals are queued.

## 9. Privacy, custody, and disclosure contract

### 9.1 Private on Midnight

- principal shares in an account note;
- the user’s private balance-seconds and finalized private TWAB;
- owner secret, redemption secret, and salt;
- account-note contents and successor links;
- winner identity as represented by the owner commitment/secret binding;
- unredeemed private winnings and the user’s private claim state;
- witness values submitted to a local proof server.

### 9.2 Public on Midnight

- contract and circuit names;
- transaction/action timing and public network sender metadata;
- draw IDs, phase, cutoff, deadlines, and roots;
- commitment and nullifier values;
- public randomness and its source reference;
- deposit/withdrawal batch IDs and commitment roots;
- aggregate shares/amounts and the attestor set/signatures;
- public total-share TWAB and harvested-yield budget;
- registered winner count, claim state, pause state, and protocol version.

Nullifiers are public by design. They prevent reuse; they do not make a user anonymous. A winner commitment should not contain a raw address or a reusable public key. A transaction sender, timing, wallet fingerprint, or later source-chain redemption can still create a probabilistic link.

### 9.3 Explicit non-anonymity boundaries

- EVM deposits and withdrawals expose source-chain addresses, amounts, strategy interactions, and timing.
- The attestor committee sees source-chain events, batch aggregates, and operational metadata.
- Indexers and read-model operators see all public Midnight roots, nullifiers, timings, and counts.
- A sponsor sees the transaction it pays for and can correlate quotas or circuit IDs; sponsorship is fee assistance, not an anonymity system.
- A local proof server sees private witnesses if the user runs it; a remote server would be an additional trust boundary.

The product copy must say “private protocol values and claim identity are not publicly disclosed by the contract” rather than “anonymous” or “guaranteed no-loss.”

## 10. Frontend and wallet architecture

### 10.1 Retained and replaced layers

Retain:

- Current React/Vite application structure, with the React version confirmed against the pinned Midnight frontend packages;
- Vite build and static deployment model;
- public read-model presentation, transaction timeline, responsive UX, and accessibility baseline.

Replace:

- wagmi wallet state with Midnight.js and DApp Connector;
- Zama encrypted handles, relayer/KMS queries, and EIP-712 decrypt permits;
- direct FHE contract writes with Midnight provider transactions and proof artifacts;
- browser-only transient Zama credential state with encrypted private-state storage and backup/recovery metadata.

The target provider stack is:

~~~text
DApp Connector / Midnight wallet
        │ connection, authorization, value-bearing signing, DUST
        ▼
Midnight.js wallet provider + public data provider + private state provider
        │                         │
        │                         └─ indexer/read model for roots, draws, batches
        ▼
Local proof provider → local proof server → Midnight provider → finality provider
~~~

The official local-proving flow separates local circuit execution/proof generation from wallet balance, submission, and public finalization.[^4]

### 10.2 Connection preflight

Before enabling a value-bearing action, the app runs and displays a resumable preflight:

- wallet connected and authorized through DApp Connector;
- correct Midnight preprod network and compatible wallet/API versions;
- local proof server reachable at the configured endpoint;
- proof server version and circuit ZK keys match the deployed contract/compiler build;
- local private-state directory available and encrypted backup age acceptable;
- sufficient DUST or an eligible sponsor route;
- indexer and node endpoints healthy;
- selected EVM source-chain route, asset, strategy, and attestor quorum available for entry/exit;
- current draw/batch not stale, expired, paused, or already consumed.

Failure is actionable: “connect wallet,” “switch network,” “start proof server,” “restore private state,” “update circuit keys,” “fund DUST,” “sponsor unavailable,” or “wait for finalized batch.” The UI must not present a proof-server outage as a lost-funds outcome.

### 10.3 Local proving and sponsorship

The default is a user-controlled local proof server because proofs include private witnesses. A managed remote prover is allowed only after explicit consent, encrypted transport, a clear data-handling statement, and a setting that can be disabled.

The DUST sponsor flow is ordered:

1. The user constructs the value-bearing transaction.
2. The local circuit proves it.
3. The user signs the value-bearing transaction or its exact authorization.
4. The sponsor verifies the signed payload, contract, circuit ID, draw/batch ID, nonce, value cap, expiry, and replay status.
5. Only then does the sponsor submit or pay the DUST portion.

Sponsor policy is restricted by contract address, circuit/action allowlist, per-wallet and per-IP quotas, total daily budget, maximum fee, expiry, and rate limit. A sponsor cannot rewrite an amount, recipient commitment, batch ID, or proof after the user signs.

### 10.4 Resumable cross-chain timelines

Deposit and withdrawal screens are timelines, not one synchronous button:

~~~text
source transaction
  → source receipt
  → finalized source block
  → attestation quorum
  → BridgeBatch root accepted
  → local proof generated
  → Midnight transaction submitted
  → Midnight finalization
  → source settlement/exit finalized
~~~

Persist, encrypted where private, at least:

- source transaction hash and chain ID;
- batch/draw ID and leaf index;
- proof request/job ID and circuit version;
- attestation nonce and expiry;
- Midnight transaction ID and finalization height;
- withdrawal/settlement ID;
- current state-machine step and last reconciliation timestamp.

On reload, reconcile each identifier against the source chain, attestor API, Midnight indexer, wallet state, and contract nullifier/root state. Every operation is idempotent. A stale local timeline can be repaired from public IDs without revealing private note contents.

### 10.5 Offline eligibility check

Once a user has a locally backed-up AccountNote/EligibilityReceipt and the public draw attestation is cached, the app can check the winning-zone predicate offline. It should notify “a draw is ready to check,” never “you won” or “you lost.” Only a positive local predicate generates a registerWin proof. The notification service receives no private winner bit.

This is a privacy optimization, not a security assumption: the chain still verifies the proof, and users without local state must use recovery before they can check or redeem.

## 11. Version profile

The following is the currently tested preprod profile from the official Midnight support matrix. The matrix lists supported versions rather than an evergreen compatibility promise, and its current update date is 2026-09-13.[^3] Revalidate every version immediately before implementation, after every contract compiler change, and before each release candidate.

| Component | Preprod pin |
| --- | --- |
| Compact compiler | 0.31.1 |
| Compact runtime | 0.16.0 |
| Compact JS | 2.5.1 |
| Compact devtools | 0.5.1 |
| Platform JS | 2.2.4 |
| On-chain runtime | 3.0.0 |
| Midnight.js | 4.1.1 |
| testkit-js | 4.1.1 |
| DApp Connector | 4.0.1 |
| Wallet SDK | 1.2.0 |
| Proof server | 8.1.0 |
| Node | 1.0.2 |
| Preprod indexer | 4.3.3-hotfix |
| Preprod node/RPC | https://rpc.preprod.midnight.network |
| Preprod indexer GraphQL | https://indexer.preprod.midnight.network/api/v4/graphql |
| Local proof endpoint | http://127.0.0.1:6300 |

The implementation repository must commit a machine-readable version profile and the circuit/ZK-key hash generated from it. A support-matrix drift blocks release until compile, proof, wallet, indexer, and reload tests are rerun.

## 12. Legacy migration path

### Principle

FHE ciphertexts are not portable into Midnight commitments. The migration is an explicit exit-and-re-enter flow, not a ciphertext translation or an automatic hidden balance import.

### Stages

#### Stage 0: freeze and disclose

- Freeze new deposits in the Sepolia UI immediately before the migration window.
- Keep legacy withdrawAll, claimWinnings, public unwrap, and pending-unwrap finalization available.
- Publish the legacy defect list, migration dates, source addresses, and the explicit privacy/custody boundaries.
- Stop advertising the legacy app as no-loss, production-ready, or anonymous.

#### Stage 1: deploy isolated target components

- Deploy YieldVaultRouter against the exact official preprod strategy deployment only after real accrual is proven.
- Deploy PrivatePrizeVault.compact with the pinned version profile.
- Register committee/authority keys, strategy bindings, VRF subscription, finality depths, and pause policies.
- Run compile-verified spikes before accepting any user funds.

#### Stage 2: voluntary exit and entry

- A legacy user withdraws principal and claims winnings through the legacy flow.
- The user unwraps/settles to the public source chain as required.
- The user explicitly deposits into the new EVM router and claims the resulting BridgeBatch note on Midnight.
- Do not infer that a legacy address and a new owner commitment are the same person on-chain.

#### Stage 3: shadow and limited preprod

- Run the Midnight read model and source batch reconciler beside the legacy read-only UI.
- Admit a capped cohort only after all preprod gates pass.
- Monitor proof time, private-state recovery, source finality, strategy accrual, attestor quorum, queued exits, sponsor budget, and solvency.

#### Stage 4: target default and legacy sunset

- Make the Midnight route the default only after a signed go decision.
- Keep legacy claims/withdrawals open for the published sunset period.
- Do not prune legacy slots or rotate away legacy ACLs while a claim/withdrawal remains unresolved.
- After sunset, archive read-only evidence and publish a final liability reconciliation.

### Migration failure policy

- A failed target proof does not consume a note or source batch.
- A stale or invalid attestation does not consume a deposit leaf.
- A lost local private-state backup is a user recovery incident, not permission to reconstruct private balances from FHE ciphertexts.
- If the external strategy lacks verified preprod availability, stop the migration before accepting deposits.

## 13. Threat model

### 13.1 Assets

- source-chain principal and strategy shares;
- harvested yield and pending prize liabilities;
- Midnight private account notes, eligibility receipts, winning tickets, and unredeemed winnings;
- nullifier uniqueness and cross-chain message integrity;
- draw fairness and liveness;
- private owner/winner linkage and local witness confidentiality;
- user ability to recover pending operations.

### 13.2 Actors and trust assumptions

| Actor | Capability | Assumption/limit |
| --- | --- | --- |
| Chain observer/indexer | Sees all public EVM and Midnight data, timing, roots, nullifiers, and source addresses | Cannot read valid private witnesses from public state; can perform correlation analysis. |
| Malicious prover/frontend | Chooses witness inputs and transaction ordering; may submit forged or malicious proofs | Circuit verification, secret-derived commitments, root binding, and nullifiers reject false state. |
| Proof server | Sees witnesses if remote; can fail or withhold proofs | Default is a user-controlled local server; remote use is opt-in. It cannot alter an already signed valid transaction. |
| EVM strategy/router | Holds custody, reports shares/assets, and may face upgrade/liquidity/negative-yield risk | Strategy address/version is pinned; router and strategy require independent audits and monitoring. |
| VRF coordinator | Supplies public randomness | Exact request ID, source contract, draw ID, and finality are authenticated; Midnight time is not entropy. |
| Preprod attestors | Observe source chain and sign batches/draws | At least two of three are assumed honest for preprod. This is not a production trust model. |
| DUST sponsor | Pays fees and sees sponsored transaction metadata | Cannot change user-signed value fields; quotas/rate limits constrain abuse. |
| User | May lose device, backup, or proof-server availability | Encrypted private-state backup/recovery is mandatory before value-bearing actions. |

### 13.3 Threats and controls

| Threat | Control | Residual risk/gate |
| --- | --- | --- |
| Forged witness or fake balance | Proof verifies note commitment, secret-derived owner commitment, historic root, nullifier, and arithmetic transition. | Circuit bugs require independent audit and property tests. |
| ownPublicKey() impersonation | Never authenticate with prover-controlled public key; derive owner commitment from a secret and bind the Merkle leaf to it.[^2] | Wallet recovery and secret handling remain user responsibilities. |
| Wrong Merkle path or stale root | Historic root allowlist, leaf binding, root expiry policy, and path verification. | Root retention and indexer consistency need scale/reload tests. |
| Reused account/deposit/winner/redeem nullifier | Domain-separated public nullifier sets and atomic consume-before-insert transitions. | Nullifier domains and linkability require review. |
| Replayed cross-chain message | Canonical domain includes source/destination, contract, block hash, batch/draw ID, nonce, expiry, root, and aggregate; store used message hash. | Committee collusion remains a preprod risk. |
| Invalid signature threshold | Require two distinct valid committee signatures from the active set; reject wrong key set, duplicate signer, stale rotation, and expiry. | Production needs bridge/message audit, not only committee logic. |
| Stale/fake randomness | Chainlink VRF request ID and source finality; DrawAttestation binds cutoff, draw, source reference, randomness, and nonce. | VRF service/network outage affects liveness; it does not justify block-time entropy. |
| User front-runs a winning claim | PRN is derived from public randomness plus private secret; the winning commitment contains no raw owner address. | Registration timing/sender metadata can still correlate a user; no end-to-end anonymity claim. |
| Strategy negative yield | Harvest only positive realized yield; no new prize budget when assets fall; pause/queue exits on shortfall. | Principal is still exposed to strategy, adapter, bridge, and custody risk; production risk acceptance required. |
| Strategy liquidity shortfall | Check maxWithdraw/preview values, maintain queued exits, distinguish requested/settled/finalized, and monitor age. | Users may wait; emergency exit path must be exercised. |
| Malicious or exhausted sponsor | Verify user-signed payload first; allowlist contract/circuit, fee cap, quotas, expiry, and rate limits. | Sponsor can censor or go offline; users need self-funded fallback. |
| Remote proof-server data exposure | Local proof default, explicit remote opt-in, encrypted transport, no witness logging, and clear deletion policy. | A user who opts into remote proving accepts that trust boundary. |
| Lost private state | Encrypted backup, restore drill, versioned state schema, and reload reconciliation. | If the user loses every backup, private claims may be unrecoverable without a protocol-approved recovery mechanism. |
| Reorg or insufficient finality | Wait for configured source finality; bind finalized block hash and attestation; never accept optimistic batch data for money movement. | Deep reorgs remain an operational incident. |
| Arithmetic overflow/underflow | Explicit integer widths, checked subtraction, bounded duration/share values, and property tests over max values. | The exact Compact compiler/runtime behavior must be verified in the spike. |
| Draw liveness failure | Incentivized completion, independent watchdogs, resumable phases, public stale-draw alarms, and emergency finalization rules that preserve claims. | A malicious committee/strategy may still halt cross-chain progress; emergency exits limit harm. |

## 14. Verification and acceptance gates

### 14.1 Feasibility spikes

No target implementation is accepted until these isolated artifacts compile under the pinned profile:

- **Account-note/TWAB spike:** claimDeposit, updateAccount, and post-cutoff requestWithdrawal with append-only commitments, nullifiers, historical roots, exact share-based TWAB, and no global loop.
- **Private-win spike:** publishDraw, registerWin, finalizeClaims, and redeemPrize with public VRF/randomness inputs, private owner/TWAB witness, winning-zone predicate, one draw-scoped nullifier, and zero/multiple winner behavior.
- **Attestation spike:** canonical 2-of-3 secp256k1 message verification, key rotation, expiry, nonce, finality, and replay tests.
- **Private-state/proving spike:** local proof server, backup/restore, proof-key version check, failed proof recovery, and browser/CLI provider flow.

Each spike must include generated interface artifacts and a statement of which state is public, private, disclosed, or only witnessed.

### 14.2 TWAB and state properties

Property-test across:

- multiple deposits into one account and multiple accounts;
- partial and full withdrawals;
- exact cutoff, one second before, and one second after cutoff;
- long inactivity and large elapsed durations;
- post-cutoff withdrawals that preserve the immediately preceding draw receipt;
- zero-share and dust-share boundaries;
- rollover and pro-rata rounding limits;
- maximum share, time, nonce, and balance-seconds values;
- stale roots, historic roots, root expiry, and append order;
- concurrent updates to the same note;
- duplicate/out-of-order source batches;
- withdrawal requested versus settled versus finalized;
- account note reuse and nullifier collision/domain separation.

Reference invariant:

~~~text
TWAB(end) = TWAB(lastUpdate)
           + principalShares × (end - lastUpdate)
~~~

The test harness must compare the circuit result with a high-precision reference model and report rounding exactly.

### 14.3 Adversarial proof and message tests

Reject:

- forged witnesses;
- ownPublicKey() impersonation attempts;
- wrong owner secret or owner commitment;
- wrong Merkle paths, leaves, roots, or root domains;
- reused deposit/account/winner/redeem/withdrawal nullifiers;
- replayed cross-chain messages;
- invalid signature thresholds, duplicate signatures, stale key sets, and expired signatures;
- stale randomness, wrong VRF request, wrong source contract, wrong draw, and wrong finality block;
- duplicate, skipped, reordered, and conflicting batches;
- modified aggregate amount/share values;
- attempted winner registration after the window closes;
- two registrations for the same account/draw;
- redemption of another owner’s winning commitment;
- payout claims after the winning nullifier is used.

### 14.4 Economic and solvency tests

Test zero, one, and multiple winners; zero-winner rollover; pro-rata payout rounding; and the following invariants at every state transition:

~~~text
principal is never reclassified as prize liquidity
prizeLiability <= cumulativeHarvestedPositiveYield
registeredWinnerCount == number of accepted, non-replayed registrations
winnerCount == 0 ⇒ full budget rolls forward
winnerCount > 0 ⇒ liability = floor(budget / count) × count
~~~

Also test negative strategy yield, strategy fees, share-price rounding, queued exits, partial liquidity, attestor delay, and bridge settlement failure. A zero or negative realized strategy delta cannot increase harvestedYieldBudget.

### 14.5 Operations and recovery

Exercise:

- source-chain reorgs and finality delay;
- bridge and attestor outages, quorum loss, key rotation, and expired attestations;
- VRF request delay and invalid/stale response;
- strategy negative yield, paused strategy, upgrade event, and liquidity shortfall;
- Midnight paused deposits, queued exits, emergency exit, and draw lateness;
- sponsor exhaustion, quota hit, replay, and sponsor outage;
- proof-server failure, compiler/key mismatch, and local proving timeout;
- lost/restored private state and wrong-version backup;
- browser reload at every pending operation step;
- duplicate button clicks, concurrent tabs, offline resume, and wallet extension disconnect.

The required recovery assertion is: every pending operation is either safely resumable or clearly terminal after reload, with no double claim, double withdrawal, lost note, or false “confirmed” UI.

### 14.6 Scale and performance

Reference hardware must be documented as an 8-core/16-GB laptop, including OS, browser, proof-server version, Docker/CPU limits, and network conditions.

Required measurements:

- 1,000 accounts and at least 10,000 historical commitments;
- append-only root update and indexer query latency;
- no globally linear circuit or all-user witness;
- local proof p95 ≤ 30 seconds for deposit/account update/win registration on the reference laptop;
- sponsor response p95 < 2 seconds, excluding user wallet confirmation;
- successful reload recovery for 100% of pending operation fixtures;
- memory, disk, and proof-server queue behavior under concurrent users;
- draw completion under delayed/failed keepers and attestors.

### 14.7 Timing profiles

The same state machine and security rules apply to all profiles:

| Profile | Draw cadence | Purpose |
| --- | --- | --- |
| Fast demo | Five-minute draws | Wallet/proof/claim walkthrough only; no production performance inference. |
| Preprod scale | One-hour draws | Approximately 1,000 users, real strategy accrual, VRF, batches, attestation, proving, and recovery. |
| Production | Daily draws | Lower operational churn, strategy/bridge finality margin, monitored yield harvest, and audited incentives. |

Shortening a draw may change operational timing but must not weaken finality, randomness, nullifier, or payout rules.

### 14.8 Conditional preprod go/no-go

**Decision now: NO-GO.**

The repository baseline is green after locked installation and generated typings, but that only validates the legacy demo. The following blockers remain:

- no compiled/verified PrivatePrizeVault.compact account/TWAB and private-win spikes;
- no 2-of-3 attestation implementation and replay/finality evidence;
- no Midnight local private-state/proving/reload path;
- current source pool uses mock assets and donated reserve rather than live strategy yield;
- the exact official Spark preprod deployment with positive accrual has not been verified;
- no 1,000-account/10,000-commitment benchmark;
- no complete EVM VRF → batch → attestation → Midnight draw → claim path;
- the legacy critical re-registration defect remains in the current FHE demo.

Preprod may become **GO for a limited, labeled cohort** only when all of the following are true:

- the selected Spark spUSDC deployment, or a replacement approved by this same source-backed process, is official, exact-address pinned, audited, and deployed on the target preprod chain;
- real positive strategy accrual is observed and harvested; no mocked interest or donated prize is used;
- Chainlink VRF randomness is finalized and authenticated through the complete path;
- Compact feasibility, attestation, property, adversarial, economic, operations, scale, and recovery gates pass;
- local proof p95 and sponsor p95 meet budget;
- no Critical finding remains, and every High finding has a documented mitigation and owner;
- emergency pause/exit, bridge outage, negative-yield, queued-exit, sponsor, proof-server, and restore drills pass;
- the UI discloses source-chain visibility, committee trust, strategy risk, preprod status, and the absence of end-to-end anonymity.

If the official strategy test deployment cannot be verified, the correct decision is to keep preprod no-go—not to create simulated accrual, donate a prize, or route around the gate.

### 14.9 Separate production gate

Production remains **NO-GO** until all preprod gates pass and:

- Compact circuits, Midnight deployment/configuration, and all Solidity components (router, adapter, settlement, sponsor policy) are independently audited;
- the bridge or message path is audited, trust-minimized, and independently verified;
- strategy upgrade/admin, liquidity, oracle/VRF, adapter, and custody risks are accepted by named governance;
- emergency exits and queued-exit recovery are exercised on the production topology;
- local proving meets the UX budget or embedded/browser proving is independently available and audited;
- private-state backup/recovery is documented and tested without an unsafe custodial recovery key;
- monitoring and alerts cover solvency, principal/prize separation, strategy share price, harvested yield, attestor quorum, stale batches, draw lateness, nullifier conflicts, sponsor abuse, proof queue, bridge reconciliation, and pending exits;
- production timing profile, load, reorg, incident response, and key rotation drills pass;
- the product’s claims, documentation, and support procedures match the actual privacy and custody boundaries.

## 15. Implementation order

1. Freeze the legacy deposit UI and add a prominent migration/no-production-risk notice.
2. Create the version profile and reproducible Compact/proof-server toolchain.
3. Build the account-note/TWAB spike and its reference-model properties.
4. Build the private win-registration spike and payout/rollover properties.
5. Build the canonical attestation format and 2-of-3 verifier; test reorg/finality/replay.
6. Verify Spark official preprod strategy availability and positive accrual; stop if absent.
7. Implement and audit the narrow YieldVaultRouter/adapter, VRF integration, batch roots, and exit queue.
8. Implement PrivatePrizeVault.compact from the locked interfaces.
9. Integrate Midnight.js, DApp Connector, public/private providers, local proof server, backup/recovery, and DUST sponsorship.
10. Add resumable timelines and offline eligibility checks without winner-status telemetry.
11. Run the full §14 acceptance matrix at 1,000 accounts/10,000 commitments.
12. Hold the conditional preprod go/no-go review; keep production blocked until the stricter gate.

## 16. Sources

All web sources were reviewed for this RFC on 2026-09-15. Official version/deployment availability must be rechecked immediately before implementation because network support, addresses, audits, and compatibility can change.

[^1]: PoolTogether, “Protocol Design,” official V5 design: <https://dev.pooltogether.com/protocol/design/>. Covers Prize Vault/ERC-4626 mechanics, TWAB observations, yield liquidation, draw state, public RNG, winning zones, bias handling, and claims.
[^2]: Midnight, “Security Best Practices,” official security guidance: <https://docs.midnight.network/guides/security-best-practices>. Covers public disclosures, secret-derived identity, ownPublicKey() limitations, historic Merkle paths, block time, nullifiers, replay, and arithmetic safety.
[^3]: Midnight, “Support Matrix,” official tested compatibility matrix: <https://docs.midnight.network/relnotes/support-matrix>. Source for the preprod version profile and support policy.
[^4]: Midnight, “Local Proving,” official proving guide: <https://docs.midnight.network/guides/local-proving>. Covers local proof-server privacy, provider flow, proof-server endpoints, and version/key synchronization.
[^5]: Midnight, “Build a Cross-Chain DApp with EffectStream,” official guide: <https://docs.midnight.network/guides/build-cross-chain-dapp-with-effectstream>. Describes the community-maintained cross-chain read/integration pattern; it is not an atomic bridge authorization mechanism.
[^6]: Midnight Network, “State of the Network — June 2026,” official network update: <https://midnight.network/blog/state-of-the-network-june-2026>. Reviewed as evidence of preview-environment stablecoin bridging; it does not prove the exact EVM audited-yield preprod route required here.
[^7]: Spark, “Spark Vaults V2 Integrator Guide,” official integration/deployment documentation: <https://docs.spark.finance/integrators/spark-vaults-v2>.
[^8]: Spark, official Ethereum address registry, SPARK_VAULT_V2_SPUSDC and implementation entries: <https://github.com/sparkdotfi/spark-address-registry/blob/master/src/Ethereum.sol>.
[^9]: Spark, “Security and Audits,” official security page and linked audit repository: <https://docs.spark.finance/dev/security/security-and-audits>; <https://github.com/sparkdotfi/spark-vaults-v2/tree/dev/audits>.
[^10]: Morpho, “Vault V2” and Morpho Vault API, official documentation: <https://docs.morpho.org/learn/concepts/vault-v2/>; <https://docs.morpho.org/developers/api/morpho-vaults/>.
[^11]: ChainSecurity, “Morpho Vault V2 Audit,” official audit report: <https://reports.chainsecurity.com/Morpho/ChainSecurity_Morpho_MorphoVaultV2_Audit.pdf>.
[^12]: Chainlink, “VRF v2.5 Supported Networks,” official network/coordinator documentation: <https://docs.chain.link/vrf/v2-5/supported-networks>.
[^repo-security]: MixTogether repository security policy: [SECURITY.md](../SECURITY.md), especially lines 3 and 14-22.
[^repo-app]: MixTogether current frontend/provider configuration: [App.tsx](../apps/web/src/App.tsx) and [config.ts](../apps/web/src/lib/config.ts).
[^repo-architecture]: MixTogether current architecture: [docs/architecture.md](architecture.md), lines 1-23.
[^repo-keeper]: MixTogether current keeper: [packages/contracts/scripts/keeper.ts](../packages/contracts/scripts/keeper.ts).
[^repo-readme]: MixTogether current product disclosure and fixed v1 configuration: [README.md](../README.md), lines 5-38 and 72-82.
