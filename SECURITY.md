# Security policy

Shroudly Preprod is experimental, unaudited test infrastructure with valueless `tMIX`. It may be reset and must never be presented as a Mainnet trust or real-value claim.

## Security model

- The four Compact components are the sole source of financial truth: shielded asset, threshold randomness, simulated yield, and pool accounting.
- All issuance paths share the 10,000,000 `tMIX` cap. Faucet claims are epoch-nullified; the 25,000 `tMIX` automation allocation is isolated to the evidence fixture.
- Principal custody and the Prize Reserve are segregated. Withdrawals cannot spend the Prize Reserve, and prize settlement cannot spend Principal.
- Time-Weighted Principal is updated on every contribution and withdrawal. A five-wallet Disclosure Cohort is required before a draw can settle.
- Three registered randomness contributors use unique commits/reveals and a two-of-three threshold. There is no fallback randomness.
- Winner ownership and claims use private commitments and a one-shot Claim Nullifier. Expiry rolls unclaimed value forward.
- Governance is two-of-three in Preprod. Pauses are circuit-scoped; a full settlement pause expires after 24 hours without renewal. Temporary deployer authority is removed within 24 hours.
- Recovery Kit state is encrypted with AES-256-GCM and bound to environment, deployment, and generation. Retired deployment state is exportable/read-only and cannot be imported into the active deployment.
- Backup Accounts require verified email, password, and TOTP AAL2 for reads/deletion. Browser encryption uses the Recovery Kit key, random nonce, authenticated deployment data, compare-and-swap generations, and one active writer.
- The Sponsor Service has no asset, governance, emergency, or randomness authority. It allowlists only DUST addition/finalization/submission, enforces an eight-second timeout and quotas, and preserves wallet-funded DUST fallback.
- The genuine adapter reports success only after network finality, indexer visibility, and a fresh ledger query. Raw provider objects never cross into React.

## Known limitations

- Preprod wallet participation, transaction timing, phase progress, and contribution amounts at public boundaries remain observable. Privacy claims are about shielded state, not wallet anonymity.
- Simulated Yield is a deterministic test adapter and is not an investment strategy. `tMIX` has no monetary value.
- The same maintainer controls the Preprod governance and randomness threshold keys; this is an explicit trust limitation. Independent custody is a future Mainnet gate.
- Liveness depends on permissionless callers and provider availability. Five-minute health detection disables submissions and surfaces an outage when network, indexer, proof, sponsor, or deployment checks fail.
- Mainnet transaction entrypoints are absent from this build. No environment variable or runtime switch can enable contributions.

## Reporting

Report vulnerabilities privately through a GitHub security advisory to the maintainer. Do not include keys, seed phrases, decrypted balances, provider tokens, or exploitable public transaction details in issues or evidence.
