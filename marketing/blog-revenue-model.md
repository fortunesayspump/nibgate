# Creators keep 99%. Here's the architecture that makes that enforceable.

*How Nibgate's revenue model works — and why neither we nor anyone else can move your money.*

Every creator platform has a revenue split. App Store: 30%. YouTube: 45%. Spotify: ~70%. Even most "creator-owned" protocols quietly reserve governance room to change the numbers later.

Nibgate takes **1%** — and the interesting part isn't the number. It's that the split is enforced by immutable contract bytecode, not by policy, terms of service, or our good intentions. This post explains exactly how a buyer's payment becomes spendable money in a creator's wallet, what can go wrong at each step, and why none of it depends on trusting us.

## Content stays yours. Payments stay on-chain.

On Nibgate, creators don't upload content into our platform. Your site stays your site — self-hosted, or one of our hosted subblogs at `you.nibgate.xyz`. You mark posts as paid, set a price in USDC, and integrate one script tag / SDK import. Agents and human visitors unlock content through the x402 payment standard.

When someone pays, the USDC doesn't go to a Nibgate treasury account for later payout "processing." It goes to a **fee wallet**: a minimal smart contract generated deterministically from your payout address. From there, 99% is always yours, and 1% routes to the protocol treasury. That split happens inside the contract, atomically, in a single transaction anyone can trigger.

## The fee wallet, explained simply

Three properties do all the work:

**1. The address is math, not state.**
A fee wallet address is computed from the factory contract plus your recipient address (CREATE2). You get a stable payment address the moment you price your first post — before any contract exists, before you connect anything to the hub. Buyers can even pay that address while it holds zero code; the balance just sits there attached to the address.

**2. Deployment happens lazily, at collection time.**
When funds are ready to move out, the wallet materializes at its predetermined address and inherits whatever was sent to it. No setup flow, no gas from creators, no "claim your payout" step.

**3. It holds no keys and has no admin.**
Fee wallets are contracts, not accounts. There is no private key to lose, steal, or subpoena. The only way USDC leaves is a `distribute()` call that splits the full balance between two immutable addresses in fixed proportions. Neither we nor anyone else can move principal anywhere else — the code has nowhere else to send it.

## The 1%, bounded forever

The fee starts at 1%. Two structural guarantees about changing it:

- A hard ceiling (`maxFeeBps`, 5%) is frozen into each wallet at deploy. No future governance can exceed it, retroactively or otherwise.
- Legitimate changes route through a timelock: they become public chain data, sit visible for a delay period, and execution is permissionless. A leaked admin key could raise fees only *visibly*, *within the cap*, *days after everyone saw it coming*. It cannot touch creator principal.

Rounding dust from integer division goes to the creator, not the platform. We checked.

## What if Nibgate disappears tomorrow?

This is the question every creator should ask of every platform, and usually the answer is ugly. Here ours:

`distribute()` is **permissionless**. If our keeper vanishes forever, any person, bot, or block explorer widget can trigger your payout — you get paid exactly the same. The split lives in bytecode that outlives the company. Liveness doesn't depend on us running; it depends on Arc existing.

Our keeper does run, though — it sweeps settled balances on a ~60 second cycle so payouts feel like payouts rather than an archaeology project. And because it holds no special rights, a compromised keeper key is worth approximately nothing: the attacker can spam gas, nothing more.

## Payments you can verify, not just trust

Because payments are plain on-chain transfers, every unlock has a receipt anyone can audit: transaction hash, amount, sender, destination. To stop someone replaying *your* payment hash to read *your* paid article, unlock requests carry a cryptographic signature made by the paying wallet — proving the requester is the payer — and each transaction hash unlocks exactly one piece of content, ever. Chain data answers "who paid." The signature answers "who's asking."

## Why 1%?

Because the protocol genuinely does work worth paying for: verification, discovery across sites, the hosted subblog infrastructure, agent-facing APIs, and the payment rails. One percent covers that at scale without becoming the business model's punchline. We'd rather make the pie table slightly bigger than tax every slice aggressively.

## Status

All of this is live today on Arc testnet, exercised with real payments end-to-end: direct transfers, Circle Gateway settlement, keeper sweeps with exact 99/1 splits verified on-chain, and automatic recovery of edge-case wallets. The contracts ship with 54 Foundry tests covering the split, the fee cap, and permissionless operation.

If you're a creator: point your domain or spin up a hosted subblog and price your first post in minutes.
If you're building agents: every Nibgate site speaks machine-readable discovery (`/skill.md`, `/discovery.md`) and pays through open x402 rails.

Docs: [nibgate.xyz/docs](https://nibgate.xyz/docs) · Revenue model deep dive: [nibgate.xyz/docs/revenue-model](https://docs.nibgate.xyz/revenue-model) · Contracts and SDK are open source.

---

*Your content, your wallet, your keys. We take 1% to keep the lights on — and the other 99% was never ours to begin with.*
