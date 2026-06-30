# Nibgate Docs

Dedicated documentation app for `docs.nibgate.xyz`.

## Local development

```bash
npm --workspace @nibgate/docs run dev
```

The docs app runs on port `3002` by default.

## Deploying to docs.nibgate.xyz

Create a separate Vercel project from the same GitHub repo with:

```txt
Root Directory: docs
Build Command: npm run build
Output Directory: .next
Install Command: npm install
```

Then add the custom domain:

```txt
docs.nibgate.xyz
```

## Current sections

- Quick start
- Install package
- Hub widget
- Verify a site
- Content events
- Analytics events
- Payments and receipts
- API reference
- Examples
