---
phase: planning
feature: mixtogether
title: MixTogether implementation plan
status: in-progress
---

# MixTogether implementation plan

## Queue

- [x] Record approved requirements and design; validate current Zama sources.
- [x] Scaffold pnpm workspace, Hardhat V2 package, and Vite React package.
- [x] Contract red/green: callback accounting, registration, ACL, exits, phase machine, accrual, randomization, selection, pruning, pause, and ownership.
- [x] Contract invariants and deterministic random harness.
- [x] Deployment scripts, address validator, keeper, ABI export, and Sepolia smoke tooling.
- [x] Web red/green: formatting, privacy reveal model, draw action model, pending unwrap persistence, dashboard, and failure states.
- [x] Component/accessibility tests and preview-mode Playwright flows.
- [x] Brand, README, CI, environment template, security disclosures, license, and release collateral.
- [x] Run full local gates, audit the implementation against requirements, and attempt authorized Sepolia/GitHub/Vercel release steps.
- [x] Preserve `OPEN`-phase withdrawal eligibility by recording the exit draw and rejecting pruning until that draw finalizes; add the regression test.
- [x] Normalize Zama SDK `TransactionResult.txHash` so SDK-backed steps always receive explorer links; add the result-shape test.
- [x] Align nominal-award and confidential-outcome copy across the dashboard and browser assertions.
- [x] Add exhaustive 65-wallet boundary and deployed cross-wallet ACL tests in `MixTogetherPool.ts`, fixing private zero handle generation in `MixTogetherPool.sol`.
- [x] Add mocked Playwright connected saver journey across desktop and mobile Chromium with in-process mock chain and Zama SDK harness.
- [x] Implement repo-root gitignored `.env` loading with resolver unit tests and fail-closed Sepolia configuration for Hardhat, keeper, and Vite.
- [x] Complete Sepolia deployment (pool deploy at `0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97` and 100 cUSDC prize reserve funding via `confidentialTransferAndCall`).
- [x] Create public GitHub repository `MrSufferer/mixtogether` and push `feat/mixtogether`.
- [x] Real Sepolia eight-occupied-slot HCU accrual/selection receipts and deployed two-wallet walkthrough.

## Dependencies

Contract ABI precedes live client writes. Zama SDK hooks are wrapped at the app boundary so UI tests remain deterministic. Sepolia deployment depends on an available funded deployer and RPC. GitHub publication depends on `gh` authentication as `MrSufferer`; preview deployment depends on Vercel authentication or the claimable fallback.

## Release status

- Vercel preview: deployed and independently checked for readiness, security headers, and browser console errors.
- Sepolia token preflight: passed for the official cUSDC/USDC pair, including a successful public faucet simulation.
- Sepolia pool deployment: deployed `MixTogetherPool` at `0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97` (tx `0xe083f629dd1a3a7e605c53cfc08a204d9a91d9b6fd596a5760afe72b40490648`), prize reserve funded with 100 cUSDC (tx `0xc7fecfa7b1070088c0f7a08244126bd21479d0dc62a3651a81c2fc5effd40e07`).
- GitHub publication: published publicly at <https://github.com/MrSufferer/mixtogether> on branch `feat/mixtogether`; CI workflow queued.
## Risks and mitigations

- FHE package/API drift: pin versions verified from official template/npm and compile against installed declarations.
- HCU overflow: smallest encrypted widths, scalar operations, eight-slot fixed batches, and Sepolia gas/HCU smoke evidence.
- Callback/refund ambiguity: accept only authenticated callbacks and credit the actual transferred handle supplied by ERC-7984.
- Privacy regression: never log/emit handles or auto-decrypt; clear revealed state on wallet/chain/session change.
- Unfinished async unshield: persist and rediscover request identifiers.
- Premature exit pruning: bind each exit to its current draw id and permit pruning only after the pool advances beyond that draw.

## Phase 5 status — 2026-09-05

- Done: repo-root gitignored `.env` loading with resolver unit tests (`packages/contracts/test/load-env.ts`), Hardhat config fail-closed accounts, keeper env loading, and Vite `envDir` sharing.
- Done: Sepolia deployment completed at `0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97` and 100 cUSDC prize reserve funded via Zama FHEVM SDK input proof.
- Done: created public GitHub repository `MrSufferer/mixtogether`, pushed `feat/mixtogether`, verified `isPrivate=false`, and confirmed CI started.

## Phase 6 reconciliation — 2026-09-05

All planned local implementation, test automation, and repository publication tasks are complete. The `.env` operator configuration is live with verified fail-closed Sepolia account resolution. The public GitHub repository is established at <https://github.com/MrSufferer/mixtogether>, and GitHub Actions CI is green (`verify` passed in 1m46s).

The external release deployment is live on Ethereum Sepolia:
1. **Contract deployment:** `MixTogetherPool` deployed at `0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97`.
2. **Prize reserve funded:** 100 cUSDC transferred and credited to the confidential prize reserve ledger.
3. **Vercel preview:** Updated with `VITE_POOL_ADDRESS` and verified with COOP/COEP headers and 0 console errors.
4. **Onchain smoke verified:** Live eight-slot HCU accrual (block 11644163, gas 2,271,055), selection (block 11644170, gas 2,804,197), user decryption, cross-wallet denial, claims, and withdrawal verified.
