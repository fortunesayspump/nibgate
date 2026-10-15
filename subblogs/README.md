# Subblogs

Full blog platform for creators, deployed on `*.nibgate.xyz` (mainnet) and `*.testnet.nibgate.xyz` (testnet). Articles, photos, music, video, free and paid posts — all with Nibgate premium content gating.

Built for creators who want to write, publish, and optionally gate premium content behind payments.

## Features

- Articles with Markdown editing, cover images, tags, excerpts, and slug auto-generation
- Photo, music, and video post support (music: encrypted audio + embedded player; video: upload or YouTube/Vimeo/SoundCloud/Spotify), plus document (PDF/DOCX) posts
- Free and paid content gating via `@nibgate/sdk`
- Whitelists, supporter price tiers, and invite-only posts (shared access-control rule)
- All post bodies and media are encrypted at rest (free and paid); free posts are decrypted and served to anyone, paid posts stay behind x402 proof (Gateway or direct USDC transfer rail); photo covers stay plaintext
- SIWE wallet sign-in plus email/password admin (wallet is a possession signal for proof-bound access)
- Admin dashboard with create, edit, publish, draft, delete, and per-post stats (unlocks, revenue, receipts)
- Multi-tenant subdomain deployment (`creator-name.nibgate.xyz`, testnet mirror `creator-name.testnet.nibgate.xyz`)
- RSS feed
- Prev/next post navigation
- About page with bio and social links

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Blog listing | `/` | Posts with date, read time, tag, excerpt |
| Single post | `/writing/:slug`, `/photos/:slug`, `/music/:slug`, `/video/:slug`, `/docs/:slug` | Clean reading layout with prev/next navigation |
| Documents | `/docs` | Browse document (PDF/DOCX) posts |
| About | `/about` | Bio, stack, and social links |
| RSS Feed | `/api/feed` | XML feed for RSS readers |
| Admin login | `/admin/login` | Email/password sign in |
| Admin dashboard | `/admin/posts` | Manage, create, edit, delete posts |
| Create post | `/admin/posts/new` | Markdown editor with slug gen, tags, cover |
| Edit post | `/admin/posts/:id` | Update content, publish/unpublish |

## Stack

- **Backend**: Express.js + Prisma ORM + PostgreSQL
- **Frontend**: Next.js 15 + React 19 + Tailwind CSS 4 + Motion (port 3002)
- **Auth**: SIWE wallet sign-in (HttpOnly `sb_auth_session` JWT) + email/password
- **Content**: Markdown with react-markdown
- **Premium gating**: `@nibgate/sdk` + `@nibgate/wallet` linked from `packages/nibgate` and `packages/wallet` in this repository — Reown AppKit (AppKit + wagmi) + viem. Paid posts unlock via the Gateway (EIP-3009) rail or the direct USDC transfer rail; access follows the wallet (reconnect + sign in to re-view, never re-pay; disconnect relocks).

## Workspace and local development

Subblogs frontend and backend belong to the repository's pnpm workspace. The repository root `pnpm-lock.yaml` is the only installation lockfile. Run installs from the repository root with the pnpm version pinned in its `packageManager` field. Do not create app-local npm lockfiles or a nested pnpm workspace.

SDK and wallet dependencies use `workspace:*`, including their mutual dependencies, so builds consume the checked-out sources without npm publication. These packages export their JavaScript/JSX sources directly; the Next frontend transpiles the wallet package. The SDK's standalone CDN bundle is a separate release artifact and is not required for these apps.

The frontend uses the same React and ReactDOM versions as the Hub. Its Tiptap core and ProseMirror adapter are explicit dependencies so the isolated pnpm layout resolves one compatible editor peer graph. Prisma remains app-local: Subblogs uses Prisma 6 and its own generated client, while the Hub and Dr. Nib retain Prisma 5. A workspace migration must not replace one app's schema or generated client with another's.

### 1. Install and configure

From the repository root, using Node 22:

```bash
pnpm install --frozen-lockfile
cp subblogs/backend/.env.example subblogs/backend/.env
# Set the local DATABASE_URL and JWT_SECRET in subblogs/backend/.env.
```

### 2. Prepare a disposable development database

```bash
createdb nibgate_blog
pnpm --filter nibgate-blog-backend exec prisma db push
pnpm --filter nibgate-blog-backend exec prisma generate
pnpm --filter nibgate-blog-backend seed
```

Use `db push` only for a disposable local database. Production schema changes require a separately reviewed migration and must not run during application startup.

### 3. Start both apps

In separate terminals from the repository root:

```bash
pnpm --filter nibgate-blog-backend dev
pnpm --filter nibgate-blog-frontend dev
```

The `subblogs/package.json` wrapper also provides `dev`, `build:frontend`, and `start:backend` convenience commands using root workspace filters; it has no separate package installation.

- **Blog**: http://localhost:3002
- **Admin**: http://localhost:3002/admin/posts
- **API**: http://localhost:4000/api

### Demo login

After seeding: `author@example.com` / `password123`

### Admin setup

1. Log in at `/admin/login` with email/password (admin account). Wallet sign-in via SIWE (`GET /auth/nonce` → `POST /auth/verify`) authenticates a wallet session (reader role by default) — it satisfies proof-bound access but does **not** grant admin.
2. Manage posts from the admin dashboard at `/admin/posts` — create, edit, publish, draft, or delete.
3. Configure gating per post in the editor: price, recipient wallet, **whitelist**, **whitelistPrice** (supporter tier, `0` = free for whitelisted), and **publicAccess** (`false` = invite-only).
4. Revoke/ban individual wallets from a post's access-control panel; flipping to invite-only automatically cuts off non-whitelisted paid wallets (revoke only — no refunds; x402 payments go straight to the creator's wallet and are irreversible).

Admin auth uses JWT (email) or SIWE sessions. The wallet that owns a post (its `authorId`'s wallet) is the only actor allowed to edit/delete it — other wallets get `403` unless promoted to admin.

The admin uses JWT-based authentication. Set a strong `JWT_SECRET` in production.

## Deployment

### Backend (Railway)

Configure each mainnet/testnet service independently:

1. Use the repository root as the service **Root Directory** (empty or `/`), not `subblogs/backend`. The build needs the root workspace manifest, lockfile, and `packages/` sources.
2. Select `subblogs/backend/railway.toml` as the config file. Set the build command to `pnpm --filter nibgate-blog-backend exec prisma generate` and start command to `pnpm --filter nibgate-blog-backend start` if the service dashboard overrides config-as-code.
3. Install from the repository root with `pnpm install --frozen-lockfile`, including build-time dependencies so the app-local Prisma CLI is available. The root package manager and Node 22 versions apply.
4. Keep the service's existing database and network-specific environment values. Use Railway's injected `PORT` and the matching `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, and Nibgate network configuration.
5. Include `subblogs/backend/**`, `packages/**`, and the root package/workspace/lock files in watched paths so SDK and wallet changes redeploy the service.

Build/install generates the Subblogs Prisma client. Startup does not run migrations, `db push`, or destructive reset commands. Apply any separately approved schema migration before deploying code that needs it.

### Frontend (Vercel)

For both Subblogs Vercel projects:

- **Root Directory:** `subblogs/frontend`
- **Include source files outside the Root Directory in the Build Step:** enabled (`sourceFilesOutsideRootDirectory: true`)
- **Install Command:** `npx pnpm@10.28.0 install --frozen-lockfile`
- **Build Command:** `pnpm --filter nibgate-blog-frontend build`
- **Output Directory:** `.next`

The checked-in `vercel.json` matches these commands. With the nested workspace removed, pnpm discovers the repository root workspace and its lockfile. `outputFileTracingRoot` in the Next config includes that repository root so server deployments can retain workspace source/dependency files. These repository settings do not automatically change a project's dashboard Root Directory or outside-root access setting; verify both before deployment.

If deploying the frontend to Railway instead, use repository-root build context and select `subblogs/frontend/railway.toml`, which provides the filtered build/start commands and dependency watch paths.

Two deployments share this code, one per network:

| | Mainnet | Testnet |
|---|---|---|
| Domains | `*.nibgate.xyz` wildcard | `*.testnet.nibgate.xyz` wildcard |
| `NEXT_PUBLIC_API_URL` | mainnet backend `/api` | testnet backend `/api` |
| `NEXT_PUBLIC_NIBGATE_NETWORK` | `mainnet` | `testnet` |
| `NEXT_PUBLIC_HUB_API_URL` | `https://api.nibgate.xyz` | hub API of the matching stack |

DNS is on Vercel nameservers, so adding the wildcard in each project provisions DNS automatically. No per-site domain work: every site is reachable as `<name>.nibgate.xyz` (mainnet) and `<name>.testnet.nibgate.xyz` (testnet) from creation.

### Release checks and ordering

Before pushing the workspace migration, regenerate the root lockfile with the actual pnpm resolver, verify a clean frozen install, run the SDK/backend tests, and build/type-check both the Hub and Subblogs frontends. Confirm every SDK/wallet resolution points to the checked-out workspace source and that the editor and wallet React peer identities are consistent. A package tarball build alone does not validate a workspace install.

Deploy and verify the Hub backend's tip-idempotency changes before releasing updated clients. Independent automatic deployments from a single push do not guarantee this order. Verify the exact deployment commit and network for each backend and frontend before announcing completion. npm publication is separate and is not required for these first-party deployments.

### Creating a new site

```bash
curl -X POST https://your-backend.com/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "subdomain": "creator-name",
    "name": "Their Blog",
    "username": "creator-name",
    "email": "creator@email.com",
    "password": "theirpassword"
  }'
```

Then add `creator-name.nibgate.xyz` in Vercel domains (mainnet project).
The testnet alias `creator-name.testnet.nibgate.xyz` works immediately via the wildcard — no extra step.

## Monitoring

Set `SENTRY_DSN` env var on Railway to enable error tracking. All errors are logged with tenant context `[subdomain]`.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/blog/posts` | No | List published posts; paid bodies and private storage/key metadata are omitted |
| GET | `/api/blog/posts/:slug` | No | Get single post (free bodies decrypted; paid returns teaser only; private key metadata omitted) |
| GET | `/api/blog/admin/posts` | Yes | List all posts |
| POST | `/api/blog/admin/posts` | Yes (author/admin) | Create post |
| PUT | `/api/blog/admin/posts/:id` | Yes (author/admin) | Update post |
| DELETE | `/api/blog/admin/posts/:id` | Yes (author/admin) | Delete post |
| GET | `/api/blog/admin/posts/stats` | Yes | Per-post stats (unlocks, revenue, receipts) |
| GET | `/api/auth/nonce` | No | SIWE nonce for a wallet |
| POST | `/api/auth/verify` | No | Verify signed SIWE message → `sb_auth_session` cookie |
| GET | `/api/auth/me` | Yes | Current user |
| POST | `/api/auth/logout` | Yes | Clear session |
| POST | `/api/auth/login` | No | Email/password sign in |
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/setup` | — | Create a subdomain site |
| GET | `/api/nibgate/access?path=…` | No | x402 access; 200 with decrypted content / 402 challenge |
| GET | `/api/<type>/<slug>` | No | Same-origin paid-post mirror advertised by each post page (`writing`, `photos`, `music`, `video`, `docs`); 200 body or 402 challenge |
| GET | `/api/nibgate/manifest?path=…` | No | Per-post agent contract |
| GET | `/api/nibgate/media/:postId/:kind` | No | Encrypted media proxy (proof-gated for paid posts) |
| GET | `/api/nibgate/posts/:key/quote` | No | Price + access decision |
| GET | `/api/nibgate/gateway/balances` | Yes (admin) | Depositor USDC balance |
| PUT | `/api/nibgate/posts/:key/access-control` | Admin only | Edit whitelist / publicAccess (auto-cutoff on invite-only flip) |
| POST | `/api/nibgate/posts/:key/entitlements/:wallet/revoke` | Admin only | Revoke (may re-purchase) |
| POST | `/api/nibgate/posts/:key/entitlements/:wallet/ban` | Admin only | Ban (hard deny) |
| DELETE | `/api/nibgate/posts/:key/entitlements/:wallet` | Admin only | Restore (un-ban / un-revoke) |

## Nibgate Integration

**Option A: Hosted (zero backend code)**

Add the widget to your site layout and mark premium posts with a data attribute:

```html
<script async src="https://www.nibgate.xyz/widget.js"
  data-nibgate-site="YOUR_SITE_ID"
  data-nibgate-token="YOUR_TOKEN">
</script>

<article data-nibgate-premium="0.01" data-nibgate-recipient="0xYourWallet">
  <div data-nibgate-unlock-card>
    <span data-nibgate-wallet-label>No wallet</span>
    <button data-nibgate-connect>Connect</button>
    <button data-nibgate-unlock-btn>Unlock</button>
  </div>
  <div data-nibgate-unlocked hidden>Full content...</div>
</article>
```

The widget calls `POST /hub/pay` on Nibgate's server — no backend changes needed.

**Option B: Self-hosted (use the Nibgate SDK)**

Set these env vars in `backend/.env` and run your own access route:

```
NIBGATE_SECRET=your-unlock-secret
NIBGATE_SELLER_ADDRESS=0xYourWalletAddress
NIBGATE_SHARE_KEY_SECRET=your-encryption-key-encryption-key
CIRCLE_API_KEY=your-circle-api-key
NIBGATE_SITE_ID=nibgate-blog
NIBGATE_SITE_TOKEN=your-hub-site-token
NIBGATE_API_BASE=https://api.nibgate.xyz
```

`NIBGATE_SHARE_KEY_SECRET` is the KEK that wraps every post/file DEK before it is stored; `CIRCLE_API_KEY` powers the gateway balance/deposit endpoints; the `NIBGATE_SITE_ID`/`NIBGATE_SITE_TOKEN`/`NIBGATE_API_BASE` trio sends unlock/payment events to the hub so Explore counts update.

The blog exposes a Nibgate manifest at `GET /api/nibgate/manifest` for hub discovery. A per-post agent contract is available at `GET /api/nibgate/manifest?path=/writing/<slug>` (and the post page itself embeds the same facts as `nibgate:*` meta tags, JSON-LD, and a `<link rel="alternate" type="application/json">`).

## Directory Structure

```
subblogs/
├── backend/
│   ├── prisma/          # Schema + seeds
│   └── src/
│       ├── config/      # App config, logger, passport, morgan
│       ├── controllers/ # Route handlers
│       ├── middlewares/  # Auth, validation, rate limiting, errors
│       ├── routes/      # API routes (auth, blog, nibgate)
│       ├── services/    # Business logic
│       └── utils/       # Helpers
├── frontend/
│   └── src/
│       ├── app/         # Next.js pages (blog, about, admin, api)
│       ├── components/  # Shared components
│       └── lib/         # API client + utils
└── package.json         # Convenience commands; workspace root is ../
```
