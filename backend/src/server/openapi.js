import { activeNetwork, hostsFor } from '@nibgate/internal/networks.js';

// Served per-stack: the spec describes the network this deployment settles on.
const NET = activeNetwork();
const hubApi = (process.env.NIBGATE_PUBLIC_API_URL || process.env.PUBLIC_API_URL || hostsFor(NET.name).apiBase).replace(/\/+$/, '');
const networkLabel = NET.isTestnet ? 'Arc testnet (chain ID 5042002)' : 'Arc (chain ID 5042)';

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
    type: { type: "string", enum: ["view", "unlock", "payment", "tip", "rating", "nibshare_view", "nibshare_unlock"] },
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
    status: {
      type: "string",
      enum: ["held", "settled", "released", "refunded"],
      description: "Tip payment status; held means funded but pending creator claim and is excluded from completed-tip totals",
      nullable: true,
    },
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
    version: "0.2.11",
    description:
      `Public API for the Nibgate hub: verified content discovery, paid unlocks over x402 (Circle Gateway on ${networkLabel}), Nib Tips, public ledger, reputation, and platform stats. Nibgate is an open protocol for paid content on creator-owned domains. Agent guide: https://nibgate.xyz/discovery.md`,
    contact: { name: "Nibgate", url: "https://nibgate.xyz" },
  },
  servers: [{ url: hubApi, description: "Production hub API" }],
  tags: [
    { name: "Discovery", description: "Verified content discovery for humans and AI agents" },
    { name: "Unlocks", description: "x402 paid unlocks: pay USDC, receive content" },
    { name: "Tips", description: "Nib Tip: pay the creator of any page. Resolved creators are settled instantly; unresolved/external creators are held in a no-key per-domain box, claimable by them and refundable by the payer until claimed" },
    { name: "JEV", description: "JEV decision-layer helpers: LLM-scored options for deterministic decide(). Server-side only; provider keys never leave the hub." },
    { name: "Ledger", description: "Public activity feed of views, unlocks, payments, tips (including pending funded holds), and ratings" },
    { name: "Reputation", description: "Onchain reputation and leaderboards" },
    { name: "Platform", description: "Platform-wide stats and site indexes" },
  ],
  paths: {
    "/.well-known/x402": {
      get: {
        tags: ["Discovery"],
        summary: "x402 discovery fan-out",
        description:
          "Machine-readable discovery document listing currently-live paid resource URLs (a recent paid nibshare and a paid post on a verified creator site) plus payment instructions. Used by x402 ecosystem indexers; runtime 402 challenges remain authoritative.",
        security: [{ x402: [] }],
        "x-payment-info": {
          protocols: ["x402"],
          price: { mode: "dynamic", currency: "USDC", min: "0.01", max: "1.00" },
        },
        responses: {
          "200": {
            description: "Discovery document with resources array and instructions.",
            content: { "application/json": { schema: { type: "object", properties: { version: { type: "integer" }, resources: { type: "array", items: { type: "string", format: "uri" } }, instructions: { type: "string" } } } } },
          },
        },
      },
    },
    "/ns/{slug}": {
      get: {
        tags: ["Unlocks"],
        summary: "Unlock a nibshare link",
        description:
          `Standalone share links. Free shares return the body directly; paid shares return 402 with a PAYMENT-REQUIRED header containing a standard x402 envelope (Circle Gateway scheme on ${NET.caip2}). Pay and retry the same request to receive JSON with content, media metadata, payment receipt, and a reusable unlockProof.`,
        security: [{ x402: [] }],
        "x-payment-info": {
          protocols: ["x402"],
          price: { mode: "dynamic", currency: "USDC", min: "0.01", max: "1.00" },
        },
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
    "/hub/preflight": {
      post: {
        tags: ["Unlocks"],
        summary: "Check a direct USDC transfer before the payer signs",
        description:
          "Optional, free, read-only dry run for the direct-transfer rail (Circle Gateway settles first, then the unlock is claimed). Because the transfer is irreversible, check this BEFORE sending USDC: it verifies the server-side price you were quoted, that the payTo/creator fee wallet resolves, and that the payer holds enough USDC on Arc. Returns ok:false with a reason ('price_mismatch', 'unfunded', 'recipient_unresolved', 'invalid_address') when the payment is guaranteed to fail afterwards. Nothing is charged and no transaction is created. When the hub cannot complete the check it answers ok:true with proceedAnyway:true so callers are never blocked by diagnostics.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["contentId", "price"],
                properties: {
                  contentId: { type: "string", description: "Tracked hub content id or externalId; server-side price and recipient win over body values when it maps." },
                  title: { type: "string" },
                  path: { type: "string" },
                  amount: { type: "string", description: "Amount the payer intends to send, in USDC. Compared against the server-side price." },
                  payer: { type: "string", description: "Payer wallet address (0x…). Used only to read its USDC balance; never charged." },
                  options: { type: "object", description: "Forwarded transfer options, e.g. { hosted: true }." },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Preflight result", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
    "/hub/pay": {
      post: {
        tags: ["Unlocks"],
        summary: "x402 payment gate for tracked creator-site content",
        description:
          "POST without payment credentials returns 402 with an x402 challenge bound to the content's server-side price and fee-wallet recipient. Submit the request again with the x402 payment header to verify settlement; the response contains the receipt used by creator sites to release content. Settled payments are recorded server-side (receipts, metrics, public ledger) whether the payer is a browser or a machine. Accepts optional siteId/siteToken for attribution when contentId is not a tracked hub id.",
        security: [{ x402: [] }],
        "x-payment-info": {
          protocols: ["x402"],
          price: { mode: "dynamic", currency: "USDC", min: "0.01", max: "1.00" },
        },
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
          "Returns a live feed of views, unlocks, payments, tips (including funded held tips marked status=held, from verified or external pages), onchain ratings, and privacy-safe nibshare views/unlocks across verified sites, sorted by timestamp. Held tips are pending and do not count toward completed-tip totals; refunds appear as negative tip entries. Nibshare entries carry titles, wallets, amounts, and tx hashes but never the private share link. Each entry includes verifiable fields where applicable (tx hashes, wallet addresses, receipts).",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
          { name: "skip", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          { name: "type", in: "query", schema: { type: "string", enum: ["views", "unlocks", "payments", "ratings", "tips", "nibshare"] }, description: "Filter by activity type." },
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
                        tips: { type: "integer" },
                        nibshareViews: { type: "integer" },
                        nibshareUnlocks: { type: "integer" },
                        nibshareRevenue: { type: "number" },
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
        description: "Real totals for creators, verified sites, content, views, unlocks, and revenue (unlocks + tips + nibshares).",
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
                        tips: { type: "integer" },
                        tipRevenue: { type: "number" },
                        nibshareUnlocks: { type: "integer" },
                        nibshareViews: { type: "integer" },
                        nibshareRevenue: { type: "number" },
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
    "/hub/site/verify-status": {
      get: {
        tags: ["Platform"],
        summary: "Cross-stack site verification status",
        description:
          "Public verification status for a canonical site domain, including owner wallets and publisher profile for verified sites. Widget/account verification is network-agnostic: a domain verified on one hub (testnet or mainnet) is verified on both; only txs and ratings differ per stack. Nibgate-apex hosted sites (*.nibgate.xyz subblogs) are network-pinned and never adopted cross-stack.",
        parameters: [
          { name: "domain", in: "query", required: true, schema: { type: "string" }, description: "Canonical site domain, e.g. example.com." },
        ],
        responses: {
          "200": {
            description: "Verification status; verified payload includes verificationSource (widget | owner-link | cross-stack), ownerWallets, and publisher.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    verified: { type: "boolean" },
                    verificationStatus: { type: "string" },
                    domain: { type: "string" },
                    name: { type: "string" },
                    lastVerifiedAt: { type: "string", format: "date-time", nullable: true },
                    verificationSource: { type: "string" },
                    ownerWallets: { type: "array", items: { type: "string" } },
                    publisher: { type: "object", nullable: true },
                    siteMeta: { type: "object", description: "Site display metadata (name, description, faviconUrl, ogImageUrl)." },
                    ownerProfile: { type: "object", nullable: true, description: "Creator profile (username, bio, avatarUrl, socials)." },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/hub/site/verified-identities": {
      get: {
        tags: ["Platform"],
        summary: "Peer identity index (ops, secret-gated)",
        description:
          "Lists verified sites with owner wallets and publisher profile for hub-to-hub identity sync. Requires x-peer-secret equal to the shared BLOG_LINK_SECRET. No content, receipts, ratings, or metrics are ever included.",
        responses: {
          "200": { description: "Verified site identities." },
          "403": { description: "Forbidden." },
        },
      },
    },
    "/hub/site/sync-from-peer": {
      post: {
        tags: ["Platform"],
        summary: "Mirror peer site identities (ops, secret-gated)",
        description:
          "Provisions identity-only mirror rows for peer-verified sites (translated to local canonical domains, owner resolved by wallet) plus published editorial blog posts (author by wallet, newer-local-wins). Copies site identity, verification, publisher profile, and blog posts only — never content, receipts, ratings, or metrics. Requires x-peer-secret equal to the shared BLOG_LINK_SECRET. Body: { domains: string[] } or { all: true }.",
        responses: {
          "200": { description: "Sync result with synced[] and skipped[]." },
          "403": { description: "Forbidden." },
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
    "/hub/reputation/ratings/stats": {
      get: {
        tags: ["Reputation"],
        summary: "Read a content's onchain rating stats",
        description: "Hub-authoritative rating read: resolves the content (id or externalId) and returns its indexed on-chain-proved ratings (live contract read is the fallback for not-yet-indexed ratings). Satellite stacks must use this instead of recomputing the content hash locally. Returns average on the 1-5 scale.",
        parameters: [
          { name: "contentId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Onchain rating stats",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    contentId: { type: "string" },
                    externalId: { type: "string", nullable: true },
                    contentHash: { type: "string" },
                    average: { type: "number" },
                    count: { type: "integer" },
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
    "/hub/tips/challenge": {
      post: {
        tags: ["Tips"],
        summary: "Get a tip challenge for a resolved creator",
        description:
          "Tip any page. When the hub can resolve the creator it returns a tip challenge (x402 envelope) whose payTo is the creator's payee (fee wallet when hosted, otherwise the creator wallet). Pay the indicated USDC amount, then POST the transaction to /hub/tips/verify. Tips are additive: no locked content, the receipt is the product.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["contentUrl", "amount"],
                properties: {
                  contentUrl: { type: "string", format: "uri" },
                  title: { type: "string" },
                  amount: { type: "string", description: "USDC amount, decimal string" },
                  currency: { type: "string", description: "USDC" },
                  recipient: { type: "string", description: "Creator wallet (resolved by the caller). Required unless the hub index resolves the URL." },
                  paymentRail: { type: "string", enum: ["transfer", "gateway"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Tip challenge (x402Version, accepts[], payee, feeBps, protocolFee)", content: { "application/json": { schema: { type: "object" } } } },
          "400": { description: "recipient required / invalid amount", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/hub/tips/verify": {
      post: {
        tags: ["Tips"],
        summary: "Record a settled tip",
        description:
          "Submit the payment proof (transfer txHash or Circle Gateway signature) for a resolved tip. The hub verifies the transfer, then records a Tip row with status settled and returns a receipt. No access grant: a tip is revenue, not an entitlement.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["contentUrl", "amount"],
                properties: {
                  contentUrl: { type: "string", format: "uri" },
                  title: { type: "string" },
                  amount: { type: "string" },
                  recipient: { type: "string" },
                  paymentRail: { type: "string", enum: ["transfer", "gateway"] },
                  txHash: { type: "string", description: "Required for the transfer rail" },
                  paymentSignature: { type: "string", description: "Circle Gateway signature for the gateway rail" },
                  walletAddress: { type: "string", description: "Payer wallet" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Settled tip receipt", content: { "application/json": { schema: { type: "object" } } } },
          "402": { description: "Payment verification failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/hub/tips/hold": {
      post: {
        tags: ["Tips"],
        summary: "Tip a creator not yet on Nibgate (no-key holding box)",
        description:
          "For unresolved/external creators. Call without a payment proof to get the deterministic per-domain holding box address; fund it with USDC; call again with txHash to record a Tip row with status held. Funds sit onchain in a no-key box (nobody, not even Nibgate, can move them), claimable by the verified site owner and refundable by the payer until claimed. Two rails: direct transfer or Circle Gateway credit.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["contentUrl", "amount"],
                properties: {
                  contentUrl: { type: "string", format: "uri" },
                  title: { type: "string" },
                  amount: { type: "string" },
                  currency: { type: "string" },
                  domain: { type: "string", description: "Holding key (defaults to the contentUrl hostname)" },
                  paymentRail: { type: "string", enum: ["transfer", "gateway"] },
                  txHash: { type: "string", description: "Omit to receive the box challenge; include to record the held tip" },
                  walletAddress: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "holdStatus=challenge (box) or holdStatus=held (tip)", content: { "application/json": { schema: { type: "object" } } } },
          "402": { description: "Hold transfer verification failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/hub/tips/held": {
      get: {
        tags: ["Tips"],
        summary: "List unclaimed held tips for a domain",
        description: "Public checker for funded, unclaimed tips by exact creator domain, whether or not the creator is registered with Nibgate. Accepts a domain or page URL and works for external sites; metadata is limited to what the payer/extension supplied or matching indexed content. No website-verification gate. The active API deployment determines whether the lookup is mainnet or testnet.",
        parameters: [
          { name: "domain", in: "query", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 100 } },
        ],
        responses: {
          "200": { description: "Latest held tips, count, and total pending amount for the domain", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, domain: { type: "string" }, tips: { type: "array", items: { type: "object" } }, count: { type: "integer" }, total: { type: "number" } } } } } },
        },
      },
    },
    "/hub/tips/claim": {
      post: {
        tags: ["Tips"],
        summary: "Claim a domain's held tips (creator)",
        description:
          "Site owner verifies ownership (siteId + verifyToken) then the keeper releases the domain's holding box in one atomic tx: net to the creator, held-tier cut to the treasury. Marks every held tip for the domain released. Claiming to a wallet other than the site's owner wallet additionally requires a signed claimToken proving control of that wallet.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["siteId", "token"],
                properties: {
                  siteId: { type: "string" },
                  token: { type: "string", description: "The site's verifyToken" },
                  creatorWallet: { type: "string" },
                  claimToken: { type: "object", description: "Signed claim token (message + signature) when claiming to a different wallet" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "releaseTx + feeBps + protocolFee", content: { "application/json": { schema: { type: "object" } } } },
          "403": { description: "Invalid site credentials or wallet control proof", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "409": { description: "Domain already claimed by another wallet (manual review)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/hub/tips/refund": {
      post: {
        tags: ["Tips"],
        summary: "Refund unclaimed held tips (payer)",
        description:
          "Payer-initiated refund for tips still held (never claimed/released). The payer signs a control message; the hub sums their held tips for the domain and the keeper relays an on-chain refund of the full amount, no fee. Refunded rows flip to status refunded and a negative refund entry is written to the ledger so tip totals net out. Only ever returns funds to the payer, so a proof of wallet control is sufficient.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domain", "payer", "message", "signature"],
                properties: {
                  domain: { type: "string" },
                  payer: { type: "string", description: "Payer wallet; must match the recovered signer" },
                  amount: { type: "number", description: "Optional partial amount; defaults to the full held total" },
                  message: { type: "string", description: "The signed control message" },
                  signature: { type: "string", description: "EIP-191 personal_sign signature" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Refund result (amount, refundTx)", content: { "application/json": { schema: { type: "object" } } } },
          "202": { description: "Circle Gateway credit still settling; retry the refund shortly", content: { "application/json": { schema: { type: "object" } } } },
          "403": { description: "Wallet control proof failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "404": { description: "No unclaimed held tips for this payer/domain", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/hub/jev/decide": {
      post: {
        tags: ["JEV"],
        summary: "Ask the JEV decisions model to choose one option",
        description:
          "Calls TypeSafe's actual JEV decisions model (`~typesafe/jev-latest` via OpenRouter's /api/alpha/decisions — a decisions model, not a chat model) to CHOOSE exactly one candidate over a described state. Returns the pick plus calibrated per-option probabilities and confidence. Server-side only; the provider key never leaves the hub. Used by the wallet extension as a last resort for recipient inference: rules first, model only on ambiguity, and the caller still applies its own confidence threshold before acting.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["state", "instructions", "candidates"],
                properties: {
                  state: { type: "string", description: "Situation the model reasons over — page URL, title, author, and where each wallet appeared (max 4000 chars)" },
                  instructions: { type: "string", description: "What the choice is about, in plain language (max 500 chars)" },
                  questionId: { type: "string", description: "Question key (default 'choice')" },
                  candidates: {
                    type: "array",
                    minItems: 2,
                    maxItems: 12,
                    items: {
                      type: "object",
                      required: ["id", "context"],
                      properties: {
                        id: { type: "string", description: "Candidate id the model must choose (e.g. a wallet address)" },
                        context: { type: "string", description: "Evidence describing this candidate (max 2000 chars)" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "The pick: {success, choice, confidence, probabilities, model, usage}", content: { "application/json": { schema: { type: "object" } } } },
          "400": { description: "Invalid state/instructions/candidates", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "501": { description: "Decisions not enabled in this build", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "502": { description: "Model returned no usable decision, or provider failure", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/hub/jev/classify": {
      post: {
        tags: ["JEV"],
        summary: "Classify a page as creator content (calibrated probability)",
        description:
          "Runs a JEV `noul` judgment over a described page and returns a calibrated 0..1 probability that it is a single creator-authored content page (article/story/post/media) rather than a landing/feed/app/auth/shopping page. Used by the wallet extension ONLY when its deterministic page model is inconclusive; the caller thresholds the probability and stays silent otherwise.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["state"],
                properties: {
                  state: { type: "string", description: "Page description: URL, title, site, detected kind, word count, byline, excerpt (max 4000 chars)" },
                  instructions: { type: "string", description: "Optional override of the default judgment phrasing (max 500 chars)" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "{success, probability (0..1), model, usage}", content: { "application/json": { schema: { type: "object" } } } },
          "400": { description: "Invalid state/instructions", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "501": { description: "Decisions not enabled in this build", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "502": { description: "No usable judgment, or provider failure", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/hub/jev/tags": {
      post: {
        tags: ["JEV"],
        summary: "Score candidate tags and return confident top-k",
        description:
          "Batch `noul` scoring of a caller-supplied candidate tag set (auto-generated by the caller) against a described piece of content. Returns the top-k tags whose probability clears the threshold — used to give thin content TENTATIVE discovery metadata (tag categories), never to generate prose.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["state", "candidates"],
                properties: {
                  state: { type: "string", description: "Content description: title, site, type, excerpt/path (max 4000 chars)" },
                  candidates: { type: "array", minItems: 2, maxItems: 24, items: { type: "string" }, description: "Candidate tags to score (each <= 60 chars)" },
                  topK: { type: "integer", description: "Max tags to return (1-10, default 3)" },
                  minProbability: { type: "number", description: "Minimum probability to keep (0-1, default 0)" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "{success, tags: [{tag, probability}], model, usage}", content: { "application/json": { schema: { type: "object" } } } },
          "400": { description: "Invalid state/candidates/topK", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "501": { description: "Decisions not enabled in this build", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "502": { description: "No usable tags, or provider failure", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
  },
  "x-discovery": {
    ownershipProofs: ["0x7514Ff68BE453931ce1a8e752140E209Dd125A"],
  },
  components: {
    securitySchemes: {
      x402: {
        type: "apiKey",
        in: "header",
        name: "Payment",
        description: "x402 payment challenge-response header. Include the header on retry after settlement to unlock paid content.",
      },
    },
    schemas: {
      Content: contentSchema,
      Activity: activitySchema,
      Error: errorSchema,
    },
  },
};
