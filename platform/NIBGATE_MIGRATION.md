# Nibgate Multipublisher Migration

This folder is the Nibgate multipublisher creator platform. It owns the social publishing app surface: user profiles, creator routes, posts, image/video media, comments, replies, likes, follows, notifications, search, and infinite feeds.

## Platform Direction

The platform is a creator social app: many creators publishing media into a social feed with creator profiles, community behavior, wallet identity, and Nibgate resource tracking.

## Nibgate Integration Targets

- Add wallet identity to `User`.
- Add publisher identity metadata for each creator route.
- Add content resource metadata to `Post`.
- Map media posts into Nibgate resource types: `article`, `image`, `video`, `music`, and future custom media.
- Add Nibgate manifest routes for platform-wide and per-publisher resources.
- Add Nibgate access-check routes for protected resources.
- Add tracking calls on post detail/profile/media views.
- Add dashboard links so creators can see their Nibgate-tracked route, content, metrics, receipts, ratings, and onchain activity.
- Add package-level widget support for multipublisher platforms.

## Local Setup Notes

Dependencies are installed with `npm install --ignore-scripts` when we want to avoid automatic Prisma generation during install.

The original upstream `postinstall` script has been replaced with an explicit `prisma:generate` script so normal installs do not fail when Prisma's binary host is temporarily unreachable.

Before running the full app locally:

- Configure the database in `.env`.
- Configure NextAuth values in `.env.local`.
- Run `npm run prisma:generate`.
- Run migrations and seed data.

## Current Status

- Platform source now lives directly inside the Nibgate repo.
- Dependencies installed.
- Prisma client generation passes with the current local setup.
- Root `npm run dev:platform` points to this app.
- TypeScript check passes with `npm run check`.
- Public shell and homepage have started moving into the Nibgate platform visual language.
