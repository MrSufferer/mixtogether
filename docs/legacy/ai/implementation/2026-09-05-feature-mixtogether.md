---
phase: implementation
feature: mixtogether
title: MixTogether implementation record
status: complete
---

# MixTogether implementation record

## Baseline

- Branch: `feat/mixtogether` (the approved plan's naming; AI DevKit's generic checker expects `feature-mixtogether`).
- Official baseline checked 2026-09-05: FHEVM Hardhat template `0.4.1`, `@fhevm/solidity` `0.11.1`, Hardhat `2.28.6`, and OpenZeppelin Confidential Contracts `0.5.3`.
- Official Sepolia pair and registry are treated as deploy-time assertions, not compile-time trust.

## Change log

- 2026-09-05: materialized the approved requirements, design, task queue, test strategy, deployment strategy, and monitoring notes.
- 2026-09-05: implemented the authenticated ERC-7984 receiver, confidential ledgers, bounded saver registry, batched draw state machine, guardian controls, withdrawals, claims, pruning, and ACL rotation.
- 2026-09-05: implemented deployment validation, pool deployment, ABI export, and resumable keeper scripts; live Sepolia validation passed for the official mock pair.
- 2026-09-05: built the responsive Vite dashboard, explicit batched reveal flow, session-scoped permit storage, draw controls, unwrap recovery, reduced-motion behavior, and privacy disclosures.
- 2026-09-05: completed receipt-linked transaction feedback with actionable retries and recent-draw history that never exposes winner addresses.
- 2026-09-05: added Hardhat/Vitest/Playwright coverage, CI, security and architecture documentation, demo collateral, and a ready Vercel preview.
- 2026-09-05: completed formal requirements and design reviews against current Zama protocol, Solidity, and React SDK guidance; expanded the design's trust, ACL, data, API, recovery, HCU, and rollback models.
- 2026-09-05: recorded `exitDrawId` at withdrawal, skipped pending exits during pruning until the draw id advances, cleared exit metadata on redeposit/prune, and added OPEN-withdrawal eligibility coverage; regenerated the exported pool ABI.
- 2026-09-05: prioritized Zama `txHash` in transaction feedback normalization while retaining viem and nested receipt/transaction fallbacks, with malformed-hash rejection coverage.
- 2026-09-05: aligned dashboard award language to “Nominal prize,” reserve-dependent wording, and “Confidential outcome,” including browser assertions and a privacy-safe selection action label.
- 2026-09-05: added exhaustive 65-wallet boundary (`RegistryFull`) and cross-wallet ACL tests; fixed `MixTogetherPool.sol` `_zeroFor` initialization to generate distinct private zero handles using random zero values (`FHE.sub(r, r)` with `r = FHE.randEuint64()`), eliminating an ACL leak where registered savers shared deterministic `FHE.asEuint64(0)` allowances.
- 2026-09-05: implemented mocked Playwright connected saver journey across desktop and mobile Chromium with in-page FSM store, minimal EIP-1193 chain transport, and Zama SDK mock aliases under `VITE_E2E_MOCK=1` on dedicated port 4174; verified zero mock leakage into production build.
- 2026-09-05: implemented repo-root gitignored `.env` loading for Hardhat, keeper, and Vite (`envDir`) with resolver unit tests; confirmed fail-closed Sepolia account configuration and scaffolded gitignored `.env` template.
- 2026-09-05: created public GitHub repository `MrSufferer/mixtogether` and pushed `feat/mixtogether`; confirmed `isPrivate=false` and CI workflow trigger.
- 2026-09-05: deployed `MixTogetherPool` to Sepolia at `0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97` (tx `0xe083f629dd1a3a7e605c53cfc08a204d9a91d9b6fd596a5760afe72b40490648`); funded 100 cUSDC prize reserve via `confidentialTransferAndCall` (tx `0xc7fecfa7b1070088c0f7a08244126bd21479d0dc62a3651a81c2fc5effd40e07`).
- 2026-09-06: Phase 7 Check Implementation against the approved design. No blocking code gap. Captured shipped Sepolia/Vercel artifacts, accepted low-severity client deviations, replaced the stale “do not claim Sepolia” handoff, and set this record to complete.

## Decisions

- Use the official cUSDC mock pair; custom faucet/wrapper is a deployment-only fallback after an explicit failed validation.
- Keep all draw progress public and all financial magnitude/outcome state encrypted.
- Keep UI domain logic pure and separately tested from wallet, relayer, and browser persistence boundaries.

## Shipped artifacts

| Item | Value |
| --- | --- |
| Pool | `0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97` |
| Guardian | `0xeD37FD0d6F0f69236E7472B36796e133D20EcC32` |
| cUSDC | `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639` |
| Mock USDC | `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF` |
| Wrapper registry | `0x2f0750Bbb0A246059d80e94c454586a7F27a128e` |
| Deploy tx | `0xe083f629dd1a3a7e605c53cfc08a204d9a91d9b6fd596a5760afe72b40490648` (block 11643952, `2026-09-06T01:01:26.202Z`) |
| Reserve funding | 100 cUSDC, tx `0xc7fecfa7b1070088c0f7a08244126bd21479d0dc62a3651a81c2fc5effd40e07` (block 11643972) |
| Eight-slot HCU accrual | tx `0xe3ed691d8b1f9b2926f5b995c6087f9ea1f8917d5fdbe6410098c4d7e4e6eb55` (block 11644163, gas 2,271,055) |
| Eight-slot HCU selection | tx `0xd2b5a77d9c9ce78728fda476a92c5e15129024ccdee624dc29ab2882ac5d69f3` (block 11644170, gas 2,804,197) |
| Canonical live preview | <https://web-e9stkxv3e-gadillacers-projects.vercel.app> (deployment `dpl_FNwLWit2SbDq8bnrFuiDZX656fyG`) |
| Source | <https://github.com/MrSufferer/mixtogether> on `feat/mixtogether` |

The older preview `https://web-hphdy0jc7-gadillacers-projects.vercel.app` still returns HTTP 200 with the same COOP/COEP/`noindex` headers; README, deployment record, and this document treat `web-e9stkxv3e-…` as canonical because that deployment has `VITE_POOL_ADDRESS` verified in-bundle.

## Deviations

**Accepted (already in requirements/design):**

- Branch name `feat/mixtogether` vs AI DevKit `feature-mixtogether`. Feature lint still fails only on that missing branch.
- Injected wagmi connector instead of RainbowKit (wagmi v3 vs current stable RainbowKit).
- Official cUSDC/USDC pair; no `MixUSDC` fallback deployed.

**Low-severity client deviations (kept; not Phase 5 work):**

- Unwrap store key is `mixtogether:pending-unwraps:${wallet}` rather than `(chainId, wrapper, wallet)`. v1 is Sepolia-only with a single wrapper, so the extra dimensions are constants.
- Unwrap recovery stores wrapper request ids and replays ~100k blocks of `UnwrapRequested` / `UnwrapFinalized` logs. It does not stage the phase-one transaction hash until an event yields the id; the SDK `useUnwrap` result already returns `unwrapRequestId`.
- Unrevealed UI is one “Reveal my private balances” CTA, not three blurred em-dash cards. After a successful permit, three labeled values render. Unrevealed ciphertexts are never shown as `0`.
- `formatTokenAmount` strips trailing zeros at six decimals. It does not apply zero-subscript notation.

**Operator tooling (not a contract miss):**

- `packages/contracts/scripts/keeper.ts` advances the draw machine only. `pruneExited` exists on the pool and is covered by contract tests; there is no keeper CLI or dashboard control for it.

## Phase 7 alignment review — 2026-09-06

Compared shipped code to `docs/ai/design/2026-09-05-feature-mixtogether.md` and `docs/ai/requirements/2026-09-05-feature-mixtogether.md`. No blocking implementation finding. No return to design or Execute Plan.

### Contract (`packages/contracts/contracts/MixTogetherPool.sol`)

- Callback: `msg.sender` must be cUSDC, `data.length == 32`, modes `DEPOSIT=1` / `PRIZE=2`, credits the transferred `amount`, returns encrypted `true` with transient token grant.
- Separate encrypted principal, reserve, and winnings; deposits never fund prizes.
- Draw machine `OPEN → ACCRUE → RANDOMIZE → SELECT → OPEN`, eight-slot batches, 64-slot registry.
- Withdraw/claim in every phase; `exitDrawId` gates `pruneExited` until `current drawId > exitDrawId`; redeposit clears both exit markers.
- Random mapping is `euint128` multiply plus public 64-bit shift. Award is `FHE.min(_prizeReserve, NOMINAL_PRIZE)`.
- ACL: `allowThis` on stored handles, user grants via `_persistUser64`, transient token grants, guardian-only current reserve, handle rotation on `acceptOwnership`. `renounceOwnership` reverts `GuardianRequired`.
- Events are addresses and progress only. No handles or amounts.
- Distinct private zeros via `_zeroFor` (`FHE.sub(r, r)`).

### Tests and operator scripts

- `MixTogetherPool.ts` covers config, callback auth, ledger split, pause vs withdraw, cutoff eligibility, one confidential winner plus handle rewrite, zero-weight award restore, eight-slot local HCU, zero claims, prune-after-finalize, OPEN withdrawal through a draw, redeposit cancel, mixed prune batch, two-step guardian, 65th saver `RegistryFull`, and cross-saver ACL.
- Missing dedicated unit tests (coverage honesty for Phase 8, not code gaps): underfunded `min(reserve, 10_000_000)` when reserve is below nominal; explicit `cUSDC >= principal + reserve + winnings` liability sum.
- Keeper advances draw phases only. Deploy attempts `verify:verify` when `ETHERSCAN_API_KEY` is set and catch-warns; live source remains unverified.

### Web (`apps/web`)

- MixTogether copy, “Nominal prize,” reserve-dependent wording, “Confidential outcome,” faucet → approve → shield → deposit → reveal → claim → withdraw → unwrap → advance.
- Injected wagmi, `permitTTL: 1`, sessionStorage permits, IndexedDB SDK storage, hash extraction `txHash` → `hash` → `transactionHash`.
- Session cache clear on address/chain change. `vercel.json` sends COOP `same-origin` and COEP `require-corp`.
- Accessibility in product code: labeled amount field, live status/error regions, `focus-visible`, `@media (prefers-reduced-motion: reduce)`, `useReducedMotion`. Playwright (`dashboard.spec.ts`) asserts preview copy, disabled writes, and mobile overflow; it does not walk keyboard or reduced-motion paths.

## Remaining release follow-ups

These are operator/collateral items, not missing implementation:

1. Etherscan source + constructor verification. Sepolia page still shows “Verify and Publish” for `0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97`.
2. Demo video recording and upload.
3. Replace preview / `x-robots-tag: noindex` with a production URL. Canonical preview still sends `noindex`.
4. Independent audit as a disclosure, not a v1 blocker.

## Local gates — 2026-09-06

Fresh this session (Phase 7; production code unchanged):

- `pnpm check`: exit 0. Web 13 tests / 6 files; contracts 32 passing in 4s.
- `pnpm build`: exit 0. Solidity already compiled; Vite `7.3.5` production build with expected large WASM chunk warnings.
- `npx ai-devkit@latest lint --feature mixtogether`: exit 1. All feature docs present; only failure is missing branch `feature-mixtogether` (accepted).
- Canonical preview `https://web-e9stkxv3e-gadillacers-projects.vercel.app`: HTTP/2 200, COOP `same-origin`, COEP `require-corp`, HSTS, `nosniff`, `x-robots-tag: noindex`.
- Task tracing unavailable: `npx ai-devkit@latest task list --name mixtogether --json` → `error: unknown command 'task'` (ai-devkit@0.61.0).

`pnpm test:e2e` was not re-run this session. Live eight-slot HCU and two-wallet scripts were not re-run; receipts above are cited from the testing/deployment records.

## Phase 9 review — 2026-09-06

Design alignment holds with the accepted deviations already listed. Phase 8 tests are in the working tree and were re-run this session. No return to implementation for the shipped Sepolia pool.

Client/operator fixes included in this branch (no pool redeploy):

- `assertSuccessfulReceipt` in `apps/web/src/lib/transaction.ts`; `faucet`/`poolWrite` refuse to mark confirmed on viem `status: "reverted"`. Error state keeps the hash and links as “View failed receipt.”
- `smoke-eight-slots.ts` / `advanceDrawToOpen` loop `processAccrualBatch` / `processSelectionBatch` until the 64-slot cursor is exhausted, then randomize/finalize.

Important follow-ups still open (replacement pool or later operator work):

- Do not zero initialized `_winnings` in `_register` after prune/re-entry (`MixTogetherPool.sol` around the `_zeroFor` winnings assignment). Claim remains available after prune until a new registration overwrites the handle.
- Do not treat walkthrough saver keys as the eight-slot smoke keys.
- Untested live HCU worst case: eight occupied savers in slots 56–63, so one selection tx runs eight `_visitSelection` plus `_finalizeDraw`.

## Handoff

Implementation is aligned with the approved design, with the accepted deviations above. Phase 8 testing, Phase 9 review, and the two non-redeploy client/operator fixes above are in this branch. Next: commit and open the PR. Operator release items remain Etherscan verify, demo video, and production URL/`noindex`.
