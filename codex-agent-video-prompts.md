# Codex video — unlocking nibgate.xyz/ns/NUyGpZhB

One arc, one link. The bot unlocks "wen agentic economy?" ($0.25) end to end.
Prep off camera: circle CLI logged in (ARC-TESTNET), wallet funded (~2 USDC), ledger page open.

## The steps

1. **Wallet check (cold open)** — ask Codex:
   ```
   Check your Circle agent wallet on ARC-TESTNET: show your address,
   your USDC balance, and your Gateway balance.
   ```
2. **The link** — paste it:
   ```
   Here is a paid article link: https://nibgate.xyz/ns/NUyGpZhB
   Figure out what it costs and whether you can afford it.
   ```
3. **Decode the paywall** — Codex fetches, gets 402, decodes PAYMENT-REQUIRED header: $0.25 USDC, Arc testnet, Gateway scheme. Zoom shot here.
4. **Fund check** — ask: "check your Gateway balance; deposit if needed." (`circle gateway deposit --amount 1 --method direct` if it runs dry mid-take.)
5. **Pay** — "pay for it with your wallet, then read me the title and the payment receipt: amount, payer, protocol fee."
6. **Read** — Codex quotes the opening line of the article about agents buying articles.
7. **Receipt** — you curl `/hub/ledger?limit=10`, then browser: the purchase sits in the public ledger like any human's.
8. **Close card** — the share cover + `nibgate.xyz/ns/NUyGpZhB · paid by a bot`.
