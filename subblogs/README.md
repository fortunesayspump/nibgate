# Subblogs

Full blog platform for creators, deployed on `*.nibgate.xyz`. Articles, photos, music, video, free and paid posts — all with Nibgate premium content gating.

Built for creators who want to write, publish, and optionally gate premium content behind payments.

## Features

- Articles with Markdown editing, cover images, tags, excerpts, and slug auto-generation
- Photo, music, and video post support (music: encrypted audio + embedded player; video: upload or YouTube/Vimeo/SoundCloud/Spotify)
- Free and paid content gating via `@nibgate/sdk`
- Whitelists, supporter price tiers, and invite-only posts (shared access-control rule)
- All post bodies and media are encrypted at rest (free and paid); free posts are decrypted and served to anyone, paid posts stay behind x402 proof; photo covers stay plaintext
- SIWE wallet sign-in plus email/password admin (wallet is a possession signal for proof-bound access)
- Admin dashboard with create, edit, publish, draft, delete, and per-post stats (unlocks, revenue, receipts)
- Multi-tenant subdomain deployment (`creator-name.nibgate.xyz`)
- RSS feed
- Prev/next post navigation
- About page with bio and social links

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Blog listing | `/` | Posts with date, read time, tag, excerpt |
| Single post | `/writing/:slug`, `/photos/:slug`, `/music/:slug`, `/video/:slug` | Clean reading layout with prev/next navigation |
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
- **Premium gating**: `@nibgate/sdk` (`^0.4.8`) + `@nibgate/wallet` (`0.2.13`) from npm, exact-pinned wagmi/appkit/viem peers

## Quick Start

### 1. Database

```bash
createdb nibgate_blog
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL and JWT_SECRET in .env
npm install
npx prisma db push
npx prisma generate
npm run seed
npm run dev
```

API runs on `http://localhost:4000`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3002`.

### 4. Open it

- **Blog**: http://localhost:3002
- **Admin**: http://localhost:3002/admin/posts
- **API**: http://localhost:4000/api

### Demo login

After seeding: `author@example.com` / `password123`

### Admin setup

1. Connect a wallet with SIWE (`/auth/nonce` → `/auth/verify`) or log in at `/admin/login` with email/password. Wallet sign-in is the primary flow; email/password remains for multi-editor sites.
2. Manage posts from the admin dashboard at `/admin/posts` — create, edit, publish, draft, or delete.
3. Configure gating per post in the editor: price, recipient wallet, **whitelist**, **whitelistPrice** (supporter tier, `0` = free for whitelisted), and **publicAccess** (`false` = invite-only).
4. Revoke/ban individual wallets from a post's access-control panel; flipping to invite-only automatically cuts off non-whitelisted paid wallets (revoke only — no refunds; x402 payments go straight to the creator's wallet and are irreversible).

Admin auth uses JWT (email) or SIWE sessions. The wallet that owns a post (its `authorId`'s wallet) is the only actor allowed to edit/delete it — other wallets get `403` unless promoted to admin.

The admin uses JWT-based authentication. Set a strong `JWT_SECRET` in production.

## Deployment

### Backend (Railway)

1. Create a Railway project from `subblogs/backend/`
2. Add a PostgreSQL database (Railway auto-injects `DATABASE_URL`)
3. Set env vars: `JWT_SECRET`, `NODE_ENV=production`, `PORT=4000`
4. Railway runs `prisma migrate deploy` on start — migrations are in `prisma/migrations/`

### Frontend (Vercel)

1. Create a Vercel project from `subblogs/frontend/`
2. Set `NEXT_PUBLIC_API_URL=https://your-railway-url.up.railway.app/api`
3. Add domain (e.g., `*.nibgate.xyz`) in Vercel project → Settings → Domains
4. DNS: `*.nibgate.xyz` CNAME → `cname.vercel-dns.com`

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

Then add `creator-name.nibgate.xyz` in Vercel domains.

## Monitoring

Set `SENTRY_DSN` env var on Railway to enable error tracking. All errors are logged with tenant context `[subdomain]`.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/blog/posts` | No | List published posts |
| GET | `/api/blog/posts/:slug` | No | Get single post (free bodies decrypted; paid returns teaser only) |
| GET | `/api/blog/admin/posts` | Yes | List all posts |
| POST | `/api/blog/admin/posts` | Yes (author/admin) | Create post |
| PUT | `/api/blog/admin/posts/:id` | Yes (author/admin) | Update post |
| DELETE | `/api/blog/admin/posts/:id` | Yes (author/admin) | Delete post |
| GET | `/api/blog/admin/posts/stats` | Yes | Per-post stats (unlocks, revenue, receipts) |
| POST | `/api/auth/nonce` | No | SIWE nonce for a wallet |
| POST | `/api/auth/verify` | No | Verify signed SIWE message → `sb_auth_session` cookie |
| GET | `/api/auth/me` | Yes | Current user |
| POST | `/api/auth/logout` | Yes | Clear session |
| POST | `/api/auth/login` | No | Email/password sign in |
| POST | `/api/auth/register` | No | Create account |
| GET | `/api/setup` / POST | — | Create/read a subdomain site |
| GET | `/api/nibgate/access?path=…` | No | x402 access; 200 with decrypted content / 402 challenge |
| GET | `/api/nibgate/manifest?path=…` | No | Per-post agent contract |
| GET | `/api/nibgate/media/:postId/:kind` | No | Encrypted media proxy (proof-gated for paid posts) |
| GET | `/api/nibgate/posts/:key/quote` | No | Price + access decision |
| GET | `/api/nibgate/gateway/balances` | Yes (admin) | Depositor USDC balance |
| POST | `/api/nibgate/posts/:key/access-control` | Author/admin | Edit whitelist / publicAccess (auto-cutoff on invite-only flip) |
| POST | `/api/nibgate/posts/:key/entitlements/:wallet/revoke` | Author/admin | Revoke (may re-purchase) |
| POST | `/api/nibgate/posts/:key/entitlements/:wallet/ban` | Author/admin | Ban (hard deny) |

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

`NIBGATE_SHARE_KEY_SECRET` is the KEK that wraps every post/file DEK before it is stored (see [Content encryption](/encryption)); `CIRCLE_API_KEY` powers the gateway balance/deposit endpoints; the `NIBGATE_SITE_ID`/`NIBGATE_SITE_TOKEN`/`NIBGATE_API_BASE` trio sends unlock/payment events to the hub so Explore counts update.

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
└── package.json         # Workspace root
```
