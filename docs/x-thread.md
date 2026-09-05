# X thread draft

**1/7** Meet MixTogether 💧

Private savings. Provable chances.

It adapts PoolTogether’s no-loss mechanic for Zama FHE: save confidential cUSDC, keep principal withdrawable, and enter encrypted time-weighted draws on Sepolia.

**2/7** What stays encrypted?

Balances, principal, saver weights, exact pool size, odds, random word, ticket, prize reserve, winner result, and winnings.

The app never turns an unrevealed ciphertext into a fake `0`.

**3/7** What stays public?

Wallet participation, registry occupancy, transaction timing, draw progress, the nominal 10 cUSDC prize, and shield/unshield amounts.

FHE protects values—not wallet anonymity.

**4/7** The draw is bounded for today’s FHEVM:

- 64 savers max
- 8 occupied slots per transaction
- 5-minute epochs
- 0.1 cUSDC-second ticket precision
- permissionless `OPEN → ACCRUE → RANDOMIZE → SELECT`

**5/7** Principal never pays prizes.

The pool keeps encrypted principal, reserve, and winnings as separate liabilities. Randomization reserves up to 10 cUSDC; selection credits one encrypted interval or restores the award.

**6/7** Privacy extends to storage behavior.

Selection rewrites every visited saver’s winnings handle, not only the winner’s. A zero-value encrypted claim is valid too, so a claim transaction is not cryptographic proof of a win.

**7/7** MixTogether is experimental, unaudited Sepolia software using mock assets.

Demo: https://web-5wg8kthck-gadillacers-projects.vercel.app

Save together. Win in secret. 🔐

Suggested media: attach `output/playwright/mixtogether-desktop.png` to post 1 and the sub-three-minute demo to post 7.
