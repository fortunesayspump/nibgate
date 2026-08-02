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
    contentType: { type: "string", enum: ["article", "music", "video", "image"] },
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
    version: "0.1.0",
    description:
      "Public API for the Nibgate hub: verified content discovery, unlock/payment ledger, reputation, and platform stats. Nibgate is an open protocol for paid content on creator-owned domains.",
    contact: { name: "Nibgate", url: "https://nibgate.xyz" },
  },
  servers: [{ url: hubApi, description: "Production hub API" }],
  tags: [
    { name: "Discovery", description: "Verified content discovery for humans and AI agents" },
    { name: "Ledger", description: "Public activity feed of views, unlocks, payments, and ratings" },
    { name: "Reputation", description: "Onchain reputation and leaderboards" },
    { name: "Platform", description: "Platform-wide stats and site indexes" },
  ],
  paths: {
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
    "/api/hub/explore/content": {
      get: {
        tags: ["Discovery"],
        summary: "Explore content feed",
        description:
          "Returns verified content metadata (title, type, price, domain, reputation) filtered and sorted for discovery. This is the primary agent-facing discovery surface.",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Free-text search across title, description, tags, site name, and domain." },
          { name: "type", in: "query", schema: { type: "string", enum: ["article", "music", "video", "image", "all"] }, description: "Content type filter." },
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
    "/api/hub/ledger": {
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
    "/api/hub/stats": {
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
    "/api/hub/reputation/leaderboards": {
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
    "/api/hub/sitemap/content": {
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
    "/api/hub/sitemap-sites": {
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
    "/api/hub/evt": {
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
    "/api/hub/track": {
      post: {
        tags: ["Ledger"],
        summary: "Track a hub event (legacy)",
        description: "Legacy alias of /api/hub/evt.",
        responses: {
          "200": { description: "Event accepted" },
        },
      },
    },
    "/api/hub/reputation/ratings/prepare": {
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
    "/api/hub/reputation/ratings/index": {
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
