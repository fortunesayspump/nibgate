const hubApi = "https://api.nibgate.xyz";

const contentSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    websiteId: { type: "string" },
    websiteName: { type: "string" },
    websiteDomain: { type: "string" },
    websiteVerified: { type: "boolean" },
    title: { type: "string" },
    description: { type: "string" },
    imageUrl: { type: "string" },
    contentType: { type: "string", enum: ["article", "music", "video", "image", "document"] },
    tags: { type: "string" },
    tagList: { type: "array", items: { type: "string" } },
    url: { type: "string" },
    path: { type: "string" },
    currency: { type: "string" },
    price: { type: "number" },
    recipientWallet: { type: "string" },
    accessPolicy: { type: "string", enum: ["free", "paid", "blocked"] },
    unlockPolicy: { type: "string", enum: ["one_time"] },
    externalId: { type: "string" },
    views: { type: "integer" },
    unlocks: { type: "integer" },
    revenue: { type: "number" },
    ratings: { type: "integer" },
    reputationScore: { type: "number", nullable: true },
    reputationStars: { type: "number", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    lastSeenAt: { type: "string", format: "date-time", nullable: true },
  },
};

const activitySchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["view", "unlock", "payment", "rating"] },
    id: { type: "string" },
    websiteId: { type: "string" },
    actor: { type: "string" },
    contentId: { type: "string" },
    contentTitle: { type: "string" },
    contentUrl: { type: "string" },
    domain: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    revenue: { type: "number" },
    amount: { type: "number" },
    protocolFee: { type: "number", description: "Protocol fee (feeBps share of amount) routed to the treasury via the fee wallet", nullable: true },
    currency: { type: "string" },
    txHash: { type: "string", nullable: true },
    paymentProvider: { type: "string", nullable: true },
    receiptUrl: { type: "string", nullable: true },
    payerWallet: { type: "string", nullable: true },
    recipientWallet: { type: "string", nullable: true },
    walletAddress: { type: "string", nullable: true },
  },
};

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    details: { type: "string" },
  },
};

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Nibgate Hub API",
    version: "0.2.0",
    description:
      "Public API for the Nibgate hub: verified content discovery, paid unlocks over x402 (Circle Gateway on Arc testnet), public ledger, reputation, and platform stats. Nibgate is an open protocol for paid content on creator-owned domains. Agent guide: https://nibgate.xyz/discovery.md",
    contact: { name: "Nibgate", url: "https://nibgate.xyz" },
  },
  servers: [{ url: hubApi, description: "Production hub API" }],
  tags: [
    { name: "Discovery", description: "Verified content discovery for humans and AI agents" },
    { name: "Unlocks", description: "x402 paid unlocks: pay USDC, receive content" },
    { name: "Ledger", description: "Public activity feed of views, unlocks, payments, and ratings" },
    { name: "Reputation", description: "Onchain reputation and leaderboards" },
    { name: "Platform", description: "Platform-wide stats and site indexes" },
  ],
  paths: {
    "/ns/{slug}": {
      get: {
        tags: ["Unlocks"],
        summary: "Unlock a nibshare link",
        description:
          "Standalone share links. Free shares return the body directly; paid shares return 402 with a PAYMENT-REQUIRED header containing a standard x402 envelope (Circle Gateway scheme on eip155:5042002). Pay and retry the same request to receive JSON with content, media metadata, payment receipt, and a reusable unlockProof.",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, description: "Share slug from a nibshare link." },
        ],
        responses: {
          "200": {
            description: "Content body (free share, or paid share after settlement)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    resource: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, price: { type: "string" } } },
                    content: { type: "string", description: "Decrypted plaintext body" },
                    payment: {
                      type: "object",
                      properties: {
                        amount: { type: "number" },
                        currency: { type: "string" },
                        payerWallet: { type: "string" },
                        txHash: { type: "string", description: "Gateway settlement reference; idempotency key for retries" },
                        protocolFee: { type: "number", nullable: true },
                      },
                    },
                    unlockProof: { type: "string", description: "Signed entitlement proof; present it on later requests to re-read without paying" },
                  },
                },
              },
            },
          },
          "402": {
            description: "Payment required — PAYMENT-REQUIRED header carries the base64 x402 challenge",
          },
          "404": { description: "Unknown or revoked slug", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/nibshare/{slug}/manifest": {
      get: {
        tags: ["Unlocks"],
        summary: "Public manifest for a share",
        description: "Machine-readable metadata for a nibshare: title, type, price, currency, access policy. No authentication.",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Manifest metadata", content: { "application/json": { schema: { type: "object" } } } },
          "404": { description: "Unknown slug", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/nibshare/{slug}/meta": {
      get: {
        tags: ["Unlocks"],
        summary: "Public metadata for a share",
        description: "Public fields for a nibshare including view/unlock counters. No authentication.",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Metadata", content: { "application/json": { schema: { type: "object" } } } },
          "404": { description: "Unknown slug", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/hub/pay": {
      post: {
        tags: ["Unlocks"],
        summary: "x402 payment gate for tracked creator-site content",
        description:
          "POST without payment credentials returns 402 with an x402 challenge bound to the content's server-side price and fee-wallet recipient. Submit the request again with the x402 payment header to verify settlement; the response contains the receipt used by creator sites to release content. Settled payments are recorded server-side (receipts, metrics, public ledger) whether the payer is a browser or a machine. Accepts optional siteId/siteToken for attribution when contentId is not a tracked hub id.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["price", "recipient"],
                properties: {
                  contentId: { type: "string", description: "Tracked hub content id or externalId; server-side values win over body price/recipient when it maps." },
                  title: { type: "string" },
                  path: { type: "string" },
                  url: { type: "string" },
                  price: { type: "string", description: "Fallback price when contentId is not tracked." },
                  recipient: { type: "string", description: "Fee wallet address receiving the payment." },
                  paymentRail: { type: "string", enum: ["gateway", "transfer"] },
                  siteId: { type: "string", description: "Site UUID for attribution when contentId is not tracked." },
                  siteToken: { type: "string", description: "Site verification token." },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Payment verified",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    payment: {
                      type: "object",
                      properties: {
                        paymentProvider: { type: "string" },
                        verified: { type: "boolean" },
                        paymentId: { type: "string", nullable: true },
                        recipient: { type: "string" },
                        network: { type: "string" },
                        amount: { type: "number" },
                        revenue: { type: "number" },
                        currency: { type: "string" },
                        payer: { type: "string", nullable: true },
                        txHash: { type: "string", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          "402": { description: "Payment required — x402 challenge" },
          "400": { description: "Missing recipient/invalid body", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/api/nibgate/status": {
      get: {
        tags: ["Platform"],
        summary: "Service status",
        description: "Confirms the API is online and returns configured site/hub metadata.",
        responses: {
          "200": {
            description: "Status payload",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    site: { type: "object", properties: { name: { type: "string" }, origin: { type: "string" } } },
                    hub: { type: "object" },
                    widgetUrl: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/hub/explore/content": {
      get: {
        tags: ["Discovery"],
        summary: "Explore content feed",
        description:
          "Returns verified content metadata (title, type, price, domain, reputation) filtered and sorted for discovery. This is the primary agent-facing discovery surface.",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Free-text search across title, description, tags, site name, and domain." },
          { name: "type", in: "query", schema: { type: "string", enum: ["article", "music", "video", "image", "document", "all"] }, description: "Content type filter." },
          { name: "sort", in: "query", schema: { type: "string", enum: ["trending", "best-sellers", "hot-new"] }, description: "Sort order. Defaults to trending." },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 }, description: "Max results." },
          { name: "skip", in: "query", schema: { type: "integer", minimum: 0, default: 0 }, description: "Pagination offset." },
        ],
        responses: {
          "200": {
            description: "Explore feed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    content: { type: "array", items: contentSchema },
                    total: { type: "integer" },
                    limit: { type: "integer" },
                    skip: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/hub/ledger": {
      get: {
        tags: ["Ledger"],
        summary: "Public activity ledger",
        description:
          "Returns a live feed of views, unlocks, payments, and onchain ratings across verified sites, sorted by timestamp. Each entry includes verifiable fields where applicable (tx hashes, wallet addresses, receipts).",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
          { name: "skip", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          { name: "type", in: "query", schema: { type: "string", enum: ["views", "unlocks", "payments", "ratings"] }, description: "Filter by activity type." },
          { name: "domain", in: "query", schema: { type: "string" }, description: "Filter by site domain, e.g. example.nibgate.xyz." },
        ],
        responses: {
          "200": {
            description: "Ledger feed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    activities: { type: "array", items: activitySchema },
                    total: { type: "integer" },
                    totals: {
                      type: "object",
                      properties: {
                        views: { type: "integer" },
                        unlocks: { type: "integer" },
                        payments: { type: "integer" },
                        ratings: { type: "integer" },
                        total: { type: "integer" },
                      },
                    },
                    hasMore: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/hub/stats": {
      get: {
        tags: ["Platform"],
        summary: "Platform stats",
        description: "Real totals for creators, verified sites, content, views, unlocks, and revenue.",
        responses: {
          "200": {
            description: "Platform totals",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    stats: {
                      type: "object",
                      properties: {
                        creators: { type: "integer" },
                        sites: { type: "integer" },
                        content: { type: "integer" },
                        views: { type: "integer" },
                        unlocks: { type: "integer" },
                        revenue: { type: "number" },
                        protocolFees: { type: "number", description: "Cumulative 1% protocol fees collected on hosted payments" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/hub/reputation/leaderboards": {
      get: {
        tags: ["Reputation"],
        summary: "Reputation leaderboards",
        description: "Ranked creators, sites, or content by reputation score, unlocks, views, and revenue.",
        parameters: [
          { name: "type", in: "query", schema: { type: "string", enum: ["creators", "sites", "content"], default: "creators" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
          { name: "skip", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
        ],
        responses: {
          "200": {
            description: "Leaderboard items",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    type: { type: "string" },
                    items: { type: "array", items: { type: "object" } },
                    total: { type: "integer" },
                    limit: { type: "integer" },
                    skip: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/hub/sitemap/content": {
      get: {
        tags: ["Platform"],
        summary: "All content URLs",
        description: "URLs of all content across verified sites, up to 50k. Used for sitemap generation and agent crawling.",
        parameters: [{ name: "limit", in: "query", schema: { type: "integer", maximum: 50000, default: 50000 } }],
        responses: {
          "200": {
            description: "Content URL list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    urls: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          url: { type: "string" },
                          updatedAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/hub/sitemap-sites": {
      get: {
        tags: ["Platform"],
        summary: "Active subblog domains",
        description: "Domains of active *.nibgate.xyz sites.",
        responses: {
          "200": {
            description: "Domain list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    sites: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/hub/evt": {
      post: {
        tags: ["Ledger"],
        summary: "Track a hub event",
        description: "Ingests widget/package events (views, resource views, unlocks, payments, ratings) for verified sites. Also available as /api/hub/track for backward compatibility.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["siteId", "token"],
                properties: {
                  siteId: { type: "string", description: "Site UUID from the dashboard." },
                  token: { type: "string", description: "Site verification token." },
                  event: { type: "string", description: "Event name: page_view, resource_view, unlock_started, unlock_completed, payment_completed, content_rating." },
                  resource: { type: "object", description: "Content metadata (id, title, url, type, price)." },
                  url: { type: "string" },
                  path: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Event accepted", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" } } } } } },
          "403": { description: "Invalid site credentials", content: { "application/json": { schema: errorSchema } } },
          "429": { description: "Rate limited", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/hub/track": {
      post: {
        tags: ["Ledger"],
        summary: "Track a hub event (legacy)",
        description: "Legacy alias of /api/hub/evt.",
        responses: {
          "200": { description: "Event accepted" },
        },
      },
    },
    "/hub/reputation/ratings/prepare": {
      post: {
        tags: ["Reputation"],
        summary: "Prepare an onchain rating",
        description: "Returns the signing message, content hash, and reputation contract details so a wallet can submit an onchain rating tied to its unlock proof.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["contentId", "walletAddress", "ratingValue"],
                properties: {
                  contentId: { type: "string" },
                  walletAddress: { type: "string" },
                  ratingValue: { type: "integer", minimum: 1, maximum: 50 },
                  paymentId: { type: "string" },
                  pageOrigin: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Rating preparation payload",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    ratingValue: { type: "integer" },
                    contentHash: { type: "string" },
                    contractAddress: { type: "string" },
                    chainId: { type: "string" },
                    chainName: { type: "string" },
                    rpcUrl: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/hub/reputation/ratings/index": {
      post: {
        tags: ["Reputation"],
        summary: "Index an onchain rating",
        description: "Registers an onchain rating transaction for a content id after the wallet has submitted the rating on the reputation contract.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["contentId", "txHash"],
                properties: {
                  contentId: { type: "string" },
                  txHash: { type: "string" },
                  walletAddress: { type: "string" },
                  contentHash: { type: "string" },
                  ratingValue: { type: "integer" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Indexing result", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      Content: contentSchema,
      Activity: activitySchema,
      Error: errorSchema,
    },
  },
};
