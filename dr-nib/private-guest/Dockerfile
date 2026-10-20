# Use an independently reviewed, digest-pinned clean Node 22 base. Repeatedly
# using application images as bases eventually exceeds Docker's layer limit.
ARG NODE_IMAGE=node@sha256:7cc56ef285a8568121537d17b05e72128f01b89c54607b51acf084a50ef483f3
FROM ${NODE_IMAGE} AS build
USER root
WORKDIR /app
RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dr-nib/backend/package.json ./dr-nib/backend/package.json
COPY packages/internal/package.json ./packages/internal/package.json
COPY packages/wallet/package.json ./packages/wallet/package.json
RUN pnpm --filter @nibgate/dr-nib-backend... install --frozen-lockfile
RUN rm -rf /app/dr-nib/backend/src /app/dr-nib/backend/prisma /app/packages/internal/src /app/packages/wallet/src
COPY packages/internal ./packages/internal
COPY packages/wallet ./packages/wallet
COPY dr-nib/backend/prisma ./dr-nib/backend/prisma
RUN --network=none node /app/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js generate --schema=/app/dr-nib/backend/prisma/schema.prisma
COPY dr-nib/backend/src ./dr-nib/backend/src
COPY dr-nib/private-terminal ./dr-nib/private-terminal
USER node
WORKDIR /app/dr-nib/backend
EXPOSE 3102
CMD ["node", "src/privacy/private-guest-main.js"]
