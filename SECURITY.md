# Security policy

MixTogether is experimental, unaudited Sepolia software using mock assets. Do not use it with assets of value or present it as production-ready.

## Security model

- The configured cUSDC contract is the only accepted callback caller.
- Principal, prize reserve, and winnings are separate encrypted liabilities.
- The guardian can pause new deposits and complete a two-step ownership transfer. It cannot block withdrawals or claims, advance draws selectively, change balances, move pool funds, or alter v1 constants.
- Draw advancement is permissionless and bounded to eight occupied saver slots per accrual or selection transaction.
- The current reserve handle is rotated when guardianship changes; historical ciphertext grants cannot be revoked.
- Browser decryption requires an explicit EIP-712 signature. Decryption query data is evicted when account or chain changes, and permit storage is scoped to the browser session.

## Known limitations

- Wallet addresses, participation, timing, phase progress, and shield/unshield amounts are public.
- An encrypted zero transfer can register a saver because the contract cannot branch on the private value. Capacity is bounded and exited slots require explicit pruning.
- The random-range mapping uses `floor(random × totalWeight / 2^64)`. Its bias is negligible but non-zero unless total weight divides `2^64`.
- Liveness depends on permissionless callers; no hosted keeper SLA is provided.
- Current local FHEVM mocks exercise eight-saver HCU-limit behavior, but a real Sepolia batch smoke remains mandatory after deployment.
- Wrapper unwrapping is asynchronous and can remain pending during relayer or gateway outages.
- `pnpm audit --prod` reports no known runtime dependency vulnerabilities. The full workspace audit still reports high-severity transitive advisories inside the pinned Zama/Hardhat build-and-test toolchain; those tools are not shipped in the static web bundle and should be upgraded when compatible upstream releases land.

## Reporting

After the repository is published, report vulnerabilities through a private GitHub security advisory. Do not include keys, wallet seed phrases, decrypted balances, or exploitable public details in an issue.
