# Local build artifact for Phala CVM. Pin the immutable base-image digest and
# reviewed compose hash before any confidential release. Diagnostic-only mode
# can be built to obtain hardware evidence without credentials or private data.
FROM node:22.22.0-bookworm-slim
RUN npm install --global pnpm@10.28.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dr-nib/backend/package.json dr-nib/backend/package.json
COPY packages/internal/package.json packages/internal/package.json
COPY packages/wallet/package.json packages/wallet/package.json
RUN pnpm install --frozen-lockfile --filter @nibgate/dr-nib-backend...
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY dr-nib/backend/prisma/ dr-nib/backend/prisma/
COPY dr-nib/backend/src/ dr-nib/backend/src/
COPY packages/internal/src/ packages/internal/src/
COPY packages/wallet/src/ packages/wallet/src/
RUN pnpm --filter @nibgate/dr-nib-backend exec prisma generate --schema=./prisma/schema.prisma
ENV NODE_ENV=production
USER node
EXPOSE 3102
CMD ["node", "dr-nib/backend/src/privacy/private-guest-main.js"]
