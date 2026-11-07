"use client";

import { useMemo, useState } from "react";

type BoardType = "creators" | "sites" | "content";
type Item = Record<string, any> & { rank: number; reputationScore?: number | null; reputationStars?: number | null; ratings?: number };

type Props = {
  unavailable: Record<BoardType, boolean>;
  boardTotals: Record<BoardType, number | undefined>;
  scopes: Record<BoardType, string | undefined>;
  creators: Item[];
  sites: Item[];
  content: Item[];
  totals?: { creators: number; sites: number; content: number };
  stats?: { views: number; unlocks: number; revenue: number };
};

type SortKey = "rank" | "reputation" | "content" | "views" | "unlocks" | "revenue";
type SortDirection = "asc" | "desc";

const tabs: Array<{ id: BoardType; label: string; singular: string; helper: string }> = [
  { id: "creators", label: "Creators", singular: "Creator", helper: "Wallet accounts ranked by verified content ratings once they have reputation." },
  { id: "sites", label: "Sites", singular: "Site", helper: "Verified domains ranked by accepted content ratings once reputation exists." },
  { id: "content", label: "Content", singular: "Content", helper: "Individual resources ranked by verified 0-5 star ratings." },
];

function NoRep() {
  return <span className="inline-flex rounded-full border border-dark-gray/40 bg-gray/50 px-3 py-1 text-sm font-medium opacity-60">No rep</span>;
}

function Stars({ value, ratings = 0 }: { value?: number | null; ratings?: number }) {
  if (typeof value !== "number" || ratings <= 0) return <NoRep />;
  const rating = Math.max(0, Math.min(5, value || 0));
  const percent = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span className="inline-flex items-center gap-2 text-[var(--explore-accent,#7C9A6D)]">
      <span className="relative inline-block leading-none tracking-[0.03em]">
        <span className="opacity-30">☆☆☆☆☆</span>
        <span className="absolute left-0 top-0 overflow-hidden whitespace-nowrap" style={{ width: `${percent}%` }}>★★★★★</span>
      </span>
      <span className="text-sm text-black/60">{rating.toFixed(1)}</span>
    </span>
  );
}

function shortWallet(address = "") {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function primaryLabel(item: Item, active: BoardType) {
  if (active === "creators") return item.name || "Unnamed creator";
  if (active === "sites") return item.name || item.domain || "Verified site";
  return item.title || "Untitled content";
}

function secondaryLabel(item: Item, active: BoardType) {
  if (active === "creators") return shortWallet(item.walletAddress || "");
  if (active === "sites") return item.domain || shortWallet(item.ownerWallet || "");
  return item.websiteName || item.websiteDomain || item.contentType || "Content";
}

function imageFor(item: Item, active: BoardType) {
  if (active === "creators") return item.avatarUrl || "";
  if (active === "sites") return item.faviconUrl || item.ogImageUrl || "";
  return item.imageUrl || item.websiteOgImageUrl || "";
}

function itemHref(item: Item, active: BoardType) {
  if (active === "content") return item.url || "";
  if (active === "sites" && item.domain) return `https://${String(item.domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  return "";
}

function openItem(item: Item, active: BoardType) {
  const href = itemHref(item, active);
  if (href) window.open(href, "_blank", "noopener,noreferrer");
}

export default function LeaderboardTable({ creators, sites, content, totals, stats, unavailable, boardTotals, scopes }: Props) {
  const [active, setActive] = useState<BoardType>("creators");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [loaded, setLoaded] = useState({ creators, sites, content });
  const [loadingBoard, setLoadingBoard] = useState<BoardType | null>(null);
  const [loadErrors, setLoadErrors] = useState<Partial<Record<BoardType, string>>>({});
  const [ended, setEnded] = useState<Partial<Record<BoardType, boolean>>>({});
  const [rankingScopes, setRankingScopes] = useState(scopes);
  const data = active === "creators" ? loaded.creators : active === "sites" ? loaded.sites : loaded.content;
  const activeTab = tabs.find((tab) => tab.id === active)!;
  const filteredData = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return data;
    return data.filter((item) => {
      const haystack = [
        item.name,
        item.title,
        item.domain,
        item.walletAddress,
        item.ownerWallet,
        item.websiteName,
        item.websiteDomain,
        item.contentType,
        item.tags,
        item.description,
        item.bio,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(clean);
    });
  }, [data, query]);

  const sortedData = useMemo(() => {
    const valueFor = (item: Item) => {
      if (sortKey === "rank") return item.rank || 9999;
      if (sortKey === "reputation") return active === "content" ? item.reputationStars || 0 : item.reputationScore || 0;
      if (sortKey === "content") return item.contentCount ?? item.contentType ?? "";
      if (sortKey === "views") return item.views || 0;
      if (sortKey === "unlocks") return item.unlocks || 0;
      return item.revenue || 0;
    };

    return [...filteredData].sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const result = typeof aValue === "string" || typeof bValue === "string"
        ? String(aValue).localeCompare(String(bValue))
        : Number(aValue) - Number(bValue);
      return sortDirection === "asc" ? result : -result;
    });
  }, [active, filteredData, sortDirection, sortKey]);

  const changeSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "rank" ? "asc" : "desc");
  };

  const sortMark = (key: SortKey) => sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕";

  const aggregates = stats;

  return (
    <section className="mt-12 overflow-hidden border border-dark-gray/50 bg-white">
      <div className="border-b border-dark-gray/50 p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            {tabs.map((tab) => {
              const count = totals?.[tab.id];
              const isActive = active === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(tab.id)}
                  aria-pressed={isActive ? "true" : "false"}
                  className={`flex flex-col items-center gap-0.5 rounded-full border px-2 py-2.5 text-sm font-medium transition sm:flex-row sm:gap-1.5 sm:px-5 sm:py-3 ${isActive ? "bg-black text-white" : "bg-white text-black hover:bg-gray"}`}
                >
                  <span>{tab.label}</span>
                  {count !== undefined && <span className={`opacity-60 ${isActive ? "text-white/70" : ""}`}>({count})</span>}
                </button>
              );
            })}
          </div>
          <div className="grid w-full grid-cols-3 gap-2 text-sm lg:w-auto lg:min-w-[420px]">
            {[
              { label: "Views", value: aggregates?.views.toLocaleString() ?? "Unavailable" },
              { label: "Unlocks", value: aggregates?.unlocks.toLocaleString() ?? "Unavailable" },
              { label: "Revenue", value: aggregates?.revenue.toFixed(2) ?? "Unavailable", title: "Verified payments + public tips (USDC)" },
            ].map((stat) => (
              <div key={stat.label} title={stat.title} className="flex flex-col items-start rounded-2xl bg-gray px-3 py-2.5 sm:px-4 sm:py-3">
                <span className="text-xs tracking-wide opacity-60">{stat.label}</span>
                <strong className="mt-0.5 text-lg leading-tight">{stat.value}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_minmax(280px,420px)] lg:items-center">
          <p className="text-sm opacity-65">{activeTab.helper}</p>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${activeTab.label.toLowerCase()}...`}
            className="w-full rounded-full border border-black/45 bg-white px-5 py-3 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
          />
        </div>
      </div>

      {rankingScopes[active] === "first-500-candidates" && <p className="px-5 py-4 text-sm" role="status">Rankings cover the first 500 eligible candidates, not the full network.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead>
            <tr className="border-b border-dark-gray/50 bg-gray text-sm">
              <th className="w-20 px-5 py-4 font-medium">
                <button type="button" onClick={() => changeSort("rank")} className="inline-flex items-center gap-1 font-medium">Rank <span className={sortKey === "rank" ? "" : "opacity-35"}>{sortMark("rank")}</span></button>
              </th>
              <th className="px-5 py-4 font-medium">{activeTab.singular}</th>
              <th className="px-5 py-4 font-medium">
                <button type="button" onClick={() => changeSort("reputation")} className="inline-flex items-center gap-1 font-medium">Reputation <span className={sortKey === "reputation" ? "" : "opacity-35"}>{sortMark("reputation")}</span></button>
              </th>
              <th className="px-5 py-4 font-medium">
                <button type="button" onClick={() => changeSort("content")} className="inline-flex items-center gap-1 font-medium">Content <span className={sortKey === "content" ? "" : "opacity-35"}>{sortMark("content")}</span></button>
              </th>
              <th className="px-5 py-4 font-medium">
                <button type="button" onClick={() => changeSort("views")} className="inline-flex items-center gap-1 font-medium">Views <span className={sortKey === "views" ? "" : "opacity-35"}>{sortMark("views")}</span></button>
              </th>
              <th className="px-5 py-4 font-medium">
                <button type="button" onClick={() => changeSort("unlocks")} className="inline-flex items-center gap-1 font-medium">Unlocks <span className={sortKey === "unlocks" ? "" : "opacity-35"}>{sortMark("unlocks")}</span></button>
              </th>
              <th className="px-5 py-4 font-medium">
                <button type="button" onClick={() => changeSort("revenue")} title="Verified payments + public tips" className="inline-flex items-center gap-1 font-medium">Revenue <span className={sortKey === "revenue" ? "" : "opacity-35"}>{sortMark("revenue")}</span></button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center opacity-65">{unavailable[active] ? "Rankings are unavailable. Reload this page to try again." : query ? "No matching ranked entries." : "No ranked entries yet."}</td>
              </tr>
            ) : sortedData.map((item) => {
              const href = itemHref(item, active);
              return (
                <tr
                  key={`${active}-${item.id}`}
                  className={`border-b border-dark-gray/40 transition hover:bg-gray/70 ${href ? "cursor-pointer focus-within:bg-gray/70" : ""}`}
                  role={href ? "link" : undefined}
                  tabIndex={href ? 0 : undefined}
                  title={href ? `Open ${primaryLabel(item, active)}` : undefined}
                  onClick={() => openItem(item, active)}
                  onKeyDown={(event) => {
                    if (!href || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    openItem(item, active);
                  }}
                >
                  <td className="px-5 py-5 text-2xl font-medium">#{item.rank}</td>
                  <td className="px-5 py-5">
                    <div className="flex items-center gap-4">
                      {imageFor(item, active) && <img
                        src={imageFor(item, active)}
                        alt=""
                        width={56}
                        height={56}
                        loading="lazy"
                        decoding="async"
                        className={`${active === "creators" ? "rounded-full" : "rounded-2xl"} h-14 w-14 shrink-0 border border-dark-gray/40 object-cover bg-gray`}
                      />}
                      <div className="min-w-0">
                        <div className="truncate font-medium">{primaryLabel(item, active)}</div>
                        <div className="mt-1 truncate text-sm opacity-60">{secondaryLabel(item, active)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-5">
                    {active === "content" ? (
                      <Stars value={item.reputationStars} ratings={item.ratings} />
                    ) : typeof item.reputationScore === "number" ? (
                      <span className="text-2xl font-medium">{item.reputationScore}<span className="text-sm opacity-50">/100</span></span>
                    ) : (
                      <NoRep />
                    )}
                  </td>
                  <td className="px-5 py-5">{item.contentCount ?? item.contentType ?? "-"}</td>
                  <td className="px-5 py-5">{item.views || 0}</td>
                  <td className="px-5 py-5">{item.unlocks || 0}</td>
                  <td className="px-5 py-5">{Number(item.revenue || 0).toFixed(2)} USDC</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-dark-gray/40 p-4 text-center">
        {loadErrors[active] && <p role="status" className="mb-3">{loadErrors[active]}</p>}
        {!unavailable[active] && !ended[active] && data.length < (boardTotals[active] ?? 0) && <button
          type="button"
          disabled={loadingBoard !== null}
          onClick={async () => {
            const board = active;
            setLoadingBoard(board);
            setLoadErrors(prev => ({ ...prev, [board]: undefined }));
            try {
              const next = await fetch(`/hub/reputation/leaderboards?type=${board}&limit=50&skip=${data.length}`, { cache: "no-store" });
              if (!next.ok) throw new Error("Rankings unavailable");
              const json = await next.json();
              if (json.success === false || !Array.isArray(json.items)) throw new Error("Invalid rankings response");
              const more = json.items as Item[];
              setLoaded(prev => {
                const ids = new Set(prev[board].map(item => item.id));
                return { ...prev, [board]: [...prev[board], ...more.filter(item => !ids.has(item.id))] };
              });
              setRankingScopes(prev => ({ ...prev, [board]: json.rankingScope ?? prev[board] }));
              if (!more.length) setEnded(prev => ({ ...prev, [board]: true }));
            } catch {
              setLoadErrors(prev => ({ ...prev, [board]: "More rankings could not be loaded. Please try again." }));
            } finally {
              setLoadingBoard(null);
            }
          }}
          className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-medium disabled:opacity-50"
        >
          {loadingBoard === active ? "Loading…" : "Load more"}
        </button>}
      </div>
    </section>
  );
}
