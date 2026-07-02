# Nibgate Platform

Nibgate Platform is the multipublisher creator platform for Nibgate.

## Role In This Repo

This folder is the Nibgate multipublisher platform.

It is separate from the main `frontend`, `backend`, `docs`, and package workspaces. The goal is for this app to become the hosted creator network that uses the real `@nibgate/nibgate` package and talks to the Nibgate backend, instead of being only a package demo.

## Nibgate Goals

- Let many creators publish from one verified platform domain.
- Give every creator a route like `/alice` or future `/@alice`.
- Connect each creator account to a wallet-backed Nibgate publisher identity.
- Map posts and media into Nibgate resources.
- Expose platform-wide and per-publisher manifests to the Nibgate Hub.
- Track views, unlocks, receipts, ratings, and onchain activity per creator.
- Keep articles, images, videos, music, and future media types inside one social publishing app.

## Product Surface

The platform already has more than the public home page. Current app surfaces include:

- Public home page at `/`
- Auth pages at `/login` and `/register`
- Main creator feed at `/feed`
- Creator discovery at `/discover`
- Creator profile routes at `/:username`
- Profile tabs for posts, about, activity, photos, followers, and following
- Post detail pages at `/posts/:postId`
- Comment detail pages at `/comments/:commentId`
- Hashtag pages at `/posts/hashtag/:hashtag`
- Notifications at `/notifications`
- Setup and profile-edit flows at `/setup` and `/edit-profile`
- Public legal pages at `/terms` and `/privacy-policy`

The first visual Nibgate pass has started with the public shell, homepage, fonts, favicon, logo treatment, colors, spacing, and header direction. The remaining app surfaces should be styled into the same Nibgate platform language.

## Inherited Product Features

- Email and OAuth 2.0 login (Github, Google and Facebook)
- Users can update their info, profile photo and cover photo
- Create, update and delete posts, comments and replies
- Like and unlike posts, comments and replies
- Images and videos can be added to posts
- Drag and drop sorting of images and videos when creating and editing a post
- Hashtags can be added to posts
- Users can @ mention other users in their posts, comments and replies
- Bidirectional infinite scrolling of posts
- Follow and unfollow other users
- Search users with filters
- Display, search and filter a user's followers and following list
- Activity logging and notifications
- Gallery of user's uploaded photos and videos
- Full-page image and videos slider
- Accessible components
- Fully responsive design
- Dark and light themes

## Nibgate Integration Layer

The Nibgate layer should sit above the social primitives:

- A platform domain is verified once with Nibgate.
- Each creator account connects a wallet and receives a Nibgate publisher identity.
- Each creator profile route maps to that publisher identity.
- Every post or media item maps to a Nibgate resource record.
- The app publishes platform-wide and per-creator manifests for backend indexing.
- Page views, media views, gated unlocks, payments, receipts, ratings, and onchain events are attributed to the creator that owns the route/resource.
- The Nibgate dashboard should show the creator's platform route, content, metrics, receipts, and activity after the same wallet is connected.

This is the multipublisher platform version of the package flow. A single site can host many creators, but tracking must always include both the verified platform and the individual creator identity.

## Tech Stack

- TypeScript
- React
- Next.js
- NextAuth.js
- Tailwind CSS
- React Query
- React Aria
- React Hook Form
- Zod
- Prisma
- AWS S3
- AWS SES

## Local Setup

From the repo root:

```bash
npm run dev:platform
```

From this folder, install dependencies:

```bash
npm install --ignore-scripts
```

Generate Prisma:

```bash
npm run prisma:generate
```

Start the app:

```bash
npm run dev
```

Open [http://localhost:4400](http://localhost:4400).

## Environment

Use `.env` for Prisma and `.env.local` for app/runtime settings.

Expected local pieces include:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- OAuth credentials if testing social sign-in
- S3/SES credentials if testing production media upload or email paths

See [NIBGATE_MIGRATION.md](./NIBGATE_MIGRATION.md) for the current migration checklist.
