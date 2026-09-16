# MixTogether demo video script

Target length: 2:30–2:50. Record on Sepolia with two funded demo wallets and a funded prize reserve. Never show seed phrases, private keys, or decrypted data for a wallet that is not the presenter’s.

## 0:00–0:20 — Premise

Show the orb and headline.

> “This is MixTogether: private savings with provable chances. It keeps PoolTogether’s no-loss idea, but Zama FHE encrypts each balance, time-weighted chance, the draw ticket, reserve, and winnings.”

Point to the public-participation disclosure.

## 0:20–0:55 — Enter privately

Connect wallet A on Sepolia. Mint mock USDC, enter `10`, approve exactly 10, shield, then deposit.

> “The faucet and shield boundary are public. After shielding, the cUSDC transfer and the pool’s principal accounting stay encrypted.”

Show that the dashboard displays no guessed zero or automatic reveal.

## 0:55–1:20 — Reveal only my values

Click “Reveal my private balances,” explain the EIP-712 prompt, sign, and show the three decrypted values.

> “One explicit permit decrypts my wallet cUSDC, pool principal, and winnings together. Switching wallet or chain clears this browser view.”

Repeat a smaller deposit from wallet B without revealing it on wallet A’s screen.

## 1:20–2:00 — Permissionless draw

After the five-minute cutoff, use the UI or keeper to call `closeDraw`, accrual batches, randomization, and selection batches.

> “Anyone can advance the state machine. Eight savers are processed per FHE-heavy transaction. The encrypted random word maps into encrypted cumulative weights, and every visited winnings handle is rewritten so storage changes do not identify the winner.”

Show public phase progress, never an exact pool total or fabricated odds.

## 2:00–2:30 — Exit and privacy boundary

Reveal wallet A. If it has a positive prize, show the local-only confetti and claim. Otherwise submit a valid zero-value claim. Withdraw all principal during any phase. Optionally request and later finalize a public unwrap.

> “Principal remains withdrawable throughout. Prizes come from a separate reserve. Claims do not prove who won because encrypted zero claims are valid—but wallet participation and timing are still public.”

## 2:30–2:45 — Close

Return to the hero.

> “MixTogether is unaudited Sepolia software with mock assets. Save together. Win in secret.”
