"use client";

import Link from "next/link";
import { FiSettings, FiEdit2, FiLock, FiStar, FiSend } from "react-icons/fi";
import { TypeBadge, StatusBadge, ActiveBadge } from "./StatusBadges";
import { isEnded, endLabel } from "../../lib/shares";
import type { ShareSummary } from "../../types";

export function PostRow({ share, onSettings, onPublish }: { share: ShareSummary; onSettings: () => void; onPublish?: (slug: string) => void }) {
  const inviteOnly = share.publicAccess === false;
  const hasTier = share.whitelistPrice != null && share.whitelistPrice !== "";
  const isDraft = share.status === "draft";
  return (
    <div className="flex items-center justify-between gap-2 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h2 className="text-sm font-medium truncate max-w-[180px] sm:max-w-none">{share.title}</h2>
          <TypeBadge type={share.contentType || 'text'} />
          {inviteOnly && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "#b4530920", color: "#b45309" }}>
              <FiLock size={10} /> Invite only
            </span>
          )}
          {!inviteOnly && hasTier && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "#7c9a6d20", color: "#7c9a6d" }}>
              <FiStar size={10} /> Whitelist tier
            </span>
          )}
          {isDraft ? <StatusBadge label="draft" /> : isEnded(share) ? <StatusBadge label={endLabel(share)} /> : <ActiveBadge share={share} />}
        </div>
        {share.summary && <p className="text-xs truncate mt-0.5 hidden sm:block" style={{ color: "var(--muted)" }}>{share.summary}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isDraft && onPublish && (
          <button
            onClick={() => onPublish(share.slug)}
            className="inline-flex items-center justify-center gap-1 px-2.5 h-8 rounded-md border cursor-pointer text-xs font-semibold"
            style={{ borderColor: "var(--accent)", background: "var(--accent)", color: "#fff" }}
            title="Publish draft"
          >
            <FiSend size={13} /> Publish
          </button>
        )}
        <button onClick={onSettings} className="inline-flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer" style={{ borderColor: "var(--border)" }} title="Settings">
          <FiSettings size={15} />
        </button>
        <Link href={`/ns/${share.slug}`} className="no-underline inline-flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer" style={{ borderColor: "var(--border)" }} title="View">
          <FiEdit2 size={15} />
        </Link>
      </div>
    </div>
  );
}
