<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Hub URL standard

The backend host is `api.nibgate.xyz` — the `api.` prefix already says API, so hub routes must NOT be doubled up as `api.nibgate.xyz/api/hub/...`.

- Canonical: `https://api.nibgate.xyz/hub/<route>` (also `/nibshare`, `/auth`, `/newsletter`, `/uploads`, `/app`, `/rpc`, `/openapi.json`)
- From frontend code, call bare paths (`/hub/explore/content`) — `next.config.ts` rewrites them to the backend
- The legacy `/api/<group>/...` forms are served for backward compatibility only; never use them in new code or docs
