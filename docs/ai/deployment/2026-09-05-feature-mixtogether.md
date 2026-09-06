---
phase: deployment
feature: mixtogether
title: MixTogether deployment strategy
status: partial
---

# MixTogether deployment strategy

## Targets

- Contract: Ethereum Sepolia only, verified on Etherscan.
- Web: Vercel preview/production Vite static deployment with COOP `same-origin` and COEP `require-corp` headers.
- Source: public `MrSufferer/mixtogether` repository with branch protection/CI where account permissions allow.

## Preflight

Validate chain id `11155111`, bytecode at wrapper/underlying/registry, wrapper decimals `6`, underlying decimals `6`, `wrapper.underlying()`, both registry directions and validity, and a public capped `mint(address,uint256)` path. Abort rather than silently substitute a token. If the official faucet is unavailable, deploy the documented `MixUSDC` + stock wrapper fallback and record all addresses.

## Contract release

1. Copy `.env.example` to `.env` at repo root and set `DEPLOYER_PRIVATE_KEY` (funded hex key), plus optional `ETHERSCAN_API_KEY` and `SEPOLIA_RPC_URL`.
2. Run local gates and Sepolia dry reads.
3. Deploy `MixTogetherPool(cUSDC, guardian)` with Hardhat deploy (`pnpm deploy:sepolia`).
4. Verify source and constructor arguments.
5. Fund 100 cUSDC through `confidentialTransferAndCall(..., abi.encode(PRIZE))`.
6. Complete eight-slot HCU smoke and two-wallet scenario.
7. Commit a generated deployment manifest and ABI.

## Web release

Set only public Vite variables (`VITE_POOL_ADDRESS`, `VITE_CUSDC_ADDRESS`, `VITE_USDC_ADDRESS`, `VITE_REGISTRY_ADDRESS`, `VITE_SEPOLIA_RPC_URL`, optional WalletConnect project id). Build locally, deploy to Vercel, and use deployment status rather than fetching an isolated COOP page.

## Rollback

The pool is immutable and non-upgradeable. A broken deployment is superseded by a new address; the guardian may pause new deposits while users retain claim/withdraw access. Web rollback uses the previous Vercel deployment. No destructive migration is attempted.

## Release record — 2026-09-05

- Official pair preflight passed on chain `11155111`: code, six-decimal assets, 1:1 wrapper rate, underlying relationship, registry mappings, registry validity, and public faucet simulation.
- `MixTogetherPool` deployed to Sepolia at `0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97` (tx `0xe083f629dd1a3a7e605c53cfc08a204d9a91d9b6fd596a5760afe72b40490648`, block 11643952) with guardian `0xeD37FD0d6F0f69236E7472B36796e133D20EcC32`.
- Prize reserve funded with 100 cUSDC via `confidentialTransferAndCall` (tx `0xc7fecfa7b1070088c0f7a08244126bd21479d0dc62a3651a81c2fc5effd40e07`, block 11643972) using Zama FHEVM SDK input proof.
- Vercel preview updated and reached `READY` at <https://web-e9stkxv3e-gadillacers-projects.vercel.app> (deployment `dpl_FNwLWit2SbDq8bnrFuiDZX656fyG`) with `VITE_POOL_ADDRESS=0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97` verified inside the bundle.
- The preview returned HTTP 200 with COOP `same-origin`, COEP `require-corp`, HSTS, `nosniff`, and loaded with 0 browser console errors.
- GitHub source publication is complete; public repository is live at <https://github.com/MrSufferer/mixtogether> with active CI on `feat/mixtogether`.
