# Nibgate frontend

Main Nibgate app for the public site, creator dashboard, Explore, leaderboards, blog, and widget asset.

## Local development

```bash
npm run dev:frontend
```

Open [http://localhost:3001](http://localhost:3001).

The frontend expects the backend API at `NEXT_PUBLIC_API_URL`. Locally this defaults to [http://localhost:3000](http://localhost:3000).

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run dev:frontend
```

## Production

Production should point `NEXT_PUBLIC_API_URL` to `https://api.nibgate.xyz`.
