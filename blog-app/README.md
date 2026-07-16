# Nibgate Blog

A standalone blog platform with database, admin panel, and optional Nibgate premium content gating.

Built for creators who want to write, publish, and optionally gate premium content behind payments.

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Blog listing | `/` | Posts with date, read time, tag, excerpt |
| Single post | `/posts/:slug` | Clean reading layout with prev/next navigation |
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

## Nibgate Integration (Optional)

Set these env vars in `backend/.env` to enable premium content gating:

```
NIBGATE_SITE_ID=my-blog
NIBGATE_SITE_TOKEN=your-site-token
NIBGATE_SELLER_ADDRESS=0xYourWalletAddress
NIBGATE_PAYMENT_NETWORK=eip155:5042002
```

The blog exposes a Nibgate manifest at `GET /api/nibgate/manifest` for hub discovery.

## Directory Structure

```
blog-app/
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
