# @nibgate/cli

Nibgate CLI and gateway runtime for x402 nanopayments on creator sites. Scaffold a Nibgate site, run the payment backend locally, register and sync with the hub, and inspect buyer balances.

## Install

```bash
npm install -g @nibgate/cli
```

## Commands

| Command | What it does |
|---|---|
| `nibgate init` | Create `nibgate.config.json` in this project |
| `nibgate dev` | Run the Nibgate backend locally |
| `nibgate routes` | Print protected route config |
| `nibgate manifest` | Print the public site manifest JSON |
| `nibgate status` | Show local site and hub connection status |
| `nibgate connect` | Register this site with the Nibgate hub |
| `nibgate sync` | Send the current manifest to the Nibgate hub |
| `nibgate verify` | Ask the hub to verify site ownership |
| `nibgate event` | Emit a signed test event to the hub |
| `nibgate balance` | Show buyer wallet and Gateway balances |
| `nibgate deposit` | Deposit buyer USDC into Gateway balance |

## Environment

| Variable | Purpose |
|---|---|
| `PORT` | Server port, defaults to 3000 |
| `NIBGATE_CONFIG` | Optional absolute path to a config file |
| `NIBGATE_PAYMENT_MODE` | `demo` or `circle-gateway` |
| `NIBGATE_SELLER_ADDRESS` | EVM seller wallet for Circle Gateway mode |
| `NIBGATE_BUYER_PRIVATE_KEY` | Local/server test buyer key for Gateway payments |
| `NIBGATE_BUYER_CHAIN` | Gateway buyer chain, defaults to `arcTestnet` |
| `NIBGATE_BUYER_RPC_URL` | Optional RPC URL for the buyer chain |

## Links

- Site: https://nibgate.xyz
- Docs: https://docs.nibgate.xyz
- Creator SDK guide: https://nibgate.xyz/skill.md

## License

MIT
