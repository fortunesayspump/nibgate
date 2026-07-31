"use client";

import { useMemo, useState } from "react";

type BoardType = "creators" | "sites" | "content";
type Item = Record<string, any> & { rank: number; reputationScore?: number | null; reputationStars?: number | null; ratings?: number };

type Props = {
  creators: Item[];
  sites: Item[];
  content: Item[];
};

type SortKey = "rank" | "reputation" | "content" | "views" | "unlocks" | "revenue";
type SortDirection = "asc" | "desc";

const tabs: Array<{ id: BoardType; label: string; helper: string }> = [
  { id: "creators", label: "Creators", helper: "Wallet accounts ranked by verified content ratings once they have reputation." },
  { id: "sites", label: "Sites", helper: "Verified domains ranked by accepted content ratings once reputation exists." },
  { id: "content", label: "Content", helper: "Individual resources ranked by verified 0-5 star ratings." },
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
  if (active === "creators") return item.avatarUrl || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(item.name || item.walletAddress || "Creator")}`;
  if (active === "sites") return item.faviconUrl || item.ogImageUrl || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(item.name || item.domain || "Site")}`;
  return item.imageUrl || item.websiteOgImageUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(item.title || "Content")}`;
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

type Totals = { creators: number; sites: number; content: number };
export default function LeaderboardTable({ creators, sites, content, totals }: Props & { totals?: Totals }) {
  const [active, setActive] = useState<BoardType>("creators");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const data = active === "creators" ? creators : active === "sites" ? sites : content;
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

  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, item) => ({
        unlocks: acc.unlocks + (item.unlocks || 0),
        views: acc.views + (item.views || 0),
        revenue: acc.revenue + (item.revenue || 0),
      }),
      { unlocks: 0, views: 0, revenue: 0 }
    );
  }, [filteredData]);

  return (
    <section className="mt-12 overflow-hidden border border-dark-gray/50 bg-white">
      <div className="border-b border-dark-gray/50 p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const count = tab.id === "creators" ? (totals?.creators ?? creators.length) : tab.id === "sites" ? (totals?.sites ?? sites.length) : (totals?.content ?? content.length);
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(tab.id)}
                  className={`rounded-full border px-5 py-3 text-sm font-medium transition ${active === tab.id ? "bg-black text-white" : "bg-white text-black hover:bg-gray"}`}
                >
                  {tab.label} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[420px]">
            <div className="rounded-2xl bg-gray px-4 py-3"><span className="opacity-60">Views</span><strong className="ml-2">{totals.views}</strong></div>
            <div className="rounded-2xl bg-gray px-4 py-3"><span className="opacity-60">Unlocks</span><strong className="ml-2">{totals.unlocks}</strong></div>
            <div className="rounded-2xl bg-gray px-4 py-3"><span className="opacity-60">Revenue</span><strong className="ml-2">{totals.revenue.toFixed(2)}</strong></div>
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead>
            <tr className="border-b border-dark-gray/50 bg-gray text-sm">
              <th className="w-20 px-5 py-4 font-medium">
                <button type="button" onClick={() => changeSort("rank")} className="inline-flex items-center gap-1 font-medium">Rank <span className={sortKey === "rank" ? "" : "opacity-35"}>{sortMark("rank")}</span></button>
              </th>
              <th className="px-5 py-4 font-medium">{activeTab.label.slice(0, -1)}</th>
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
                <button type="button" onClick={() => changeSort("revenue")} className="inline-flex items-center gap-1 font-medium">Revenue <span className={sortKey === "revenue" ? "" : "opacity-35"}>{sortMark("revenue")}</span></button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center opacity-65">{query ? "No matching ranked entries." : "No ranked entries yet."}</td>
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
                      <img
                        src={imageFor(item, active)}
                        alt=""
                        className={`${active === "creators" ? "rounded-full" : "rounded-2xl"} h-14 w-14 shrink-0 border border-dark-gray/40 object-cover bg-gray`}
                      />
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
    </section>
  );
}
