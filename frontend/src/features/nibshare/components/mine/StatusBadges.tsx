"use client";

import { FiFileText, FiImage, FiMusic, FiVideo, FiCheckCircle, FiClock, FiEdit2 } from "react-icons/fi";
import { timeLeft } from "../../lib/shares";
import type { ShareSummary } from "../../types";

const TYPE_COLORS: Record<string, string> = { article: "#7c9a6d", photo: "#8b7e74", music: "#6d8a9a", video: "#9a6d8a", document: "#6d7a9a" };

function TypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = { article: <FiFileText size={14} />, photo: <FiImage size={14} />, music: <FiMusic size={14} />, video: <FiVideo size={14} />, document: <FiFileText size={14} /> };
  return <>{icons[type] || null}</>;
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${TYPE_COLORS[type] || "#888"}20`, color: TYPE_COLORS[type] || "#888" }}>
      <TypeIcon type={type} />{type}
    </span>
  );
}

function StatusBadge({ label }: { label: string }) {
  const isDraft = label === "draft";
  const isEnded = label !== "active" && !isDraft;
  const color = isDraft ? "#6d8a9a" : isEnded ? "#c4a060" : "#7c9a6d";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${color}20`, color }}>
      {isDraft ? <FiEdit2 size={12} /> : isEnded ? <FiClock size={12} /> : <FiCheckCircle size={12} />}{label}
    </span>
  );
}

export function ActiveBadge({ share }: { share: Pick<ShareSummary, "expiresAt" | "status"> }) {
  const left = timeLeft(share.expiresAt);
  if (left) return <StatusBadge label={left} />;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "#7c9a6d20", color: "#7c9a6d" }}>
      <FiCheckCircle size={12} />No expiry
    </span>
  );
}

export { StatusBadge };
