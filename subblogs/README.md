# Subblogs

Full blog platform for creators, deployed on `*.nibgate.xyz`. Articles, photos, music, video, free and paid posts — all with Nibgate premium content gating.

Built for creators who want to write, publish, and optionally gate premium content behind payments.

## Features

- Articles with Markdown editing, cover images, tags, excerpts, and slug auto-generation
- Photo, music, and video post support
- Free and paid content gating via `@nibgate/sdk`
- Admin dashboard with create, edit, publish, draft, and delete
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
- **Frontend**: Next.js 15 + React 19 + Tailwind CSS 4 + Motion
- **Auth**: JWT (email/password)
- **Content**: Markdown with react-markdown
- **Premium gating**: Optional — `@nibgate/sdk`

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

Frontend runs on `http://localhost:3001`.

### 4. Open it

- **Blog**: http://localhost:3001
- **Admin**: http://localhost:3001/admin/posts
- **API**: http://localhost:4000/api

### Demo login

After seeding: `author@example.com` / `password123`

### Admin setup

1. Create a subdomain site via the `POST /api/setup` endpoint.
2. Log in at `/admin/login` with email and password.
3. Manage posts from the admin dashboard at `/admin/posts` — create, edit, publish, draft, or delete.
4. Configure premium gating per post by setting a price and recipient wallet in the post editor.

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
| GET | `/api/blog/posts/:slug` | No | Get single post |
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Sign in |
| GET | `/api/auth/me` | Yes | Current user |
| GET | `/api/blog/admin/posts` | Yes | List all posts |
| POST | `/api/blog/admin/posts` | Yes | Create post |
| PUT | `/api/blog/admin/posts/:id` | Yes | Update post |
| DELETE | `/api/blog/admin/posts/:id` | Yes | Delete post |

## Nibgate Integration

**Option A: Hosted (zero backend code)**

Add the widget to your site layout and mark premium posts with a data attribute:

```html
<script async src="https://nibgate.xyz/widget.js"
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

The widget calls `POST /api/hub/pay` on Nibgate's server — no backend changes needed.

**Option B: Self-hosted (use the Nibgate SDK)**

Set these env vars in `backend/.env` and run your own access route:

```
NIBGATE_SECRET=your-unlock-secret
NIBGATE_SELLER_ADDRESS=0xYourWalletAddress
NIBGATE_PAYMENT_NETWORK=eip155:5042002
```

The blog exposes a Nibgate manifest at `GET /api/nibgate/manifest` for hub discovery.

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
