"use client";

import { useEffect, useState } from "react";
import { FiLock, FiShieldOff, FiRotateCcw, FiAlertTriangle } from "react-icons/fi";
import ContentViewer from "./ContentViewer";
import { NibgateUnlock, useAppKitAccount } from "@nibgate/wallet/react";
import { ACCESS_PATH, GATEWAY_BALANCE_PATH, nibshareApi } from "../api";
import type { AccessResource, Quote } from "../types";

const gateBanner: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  boxSizing: "border-box",
  width: "100%",
  maxWidth: 580,
  margin: "0 auto",
  padding: "clamp(32px, 8vw, 52px)",
  fontFamily: "var(--font-content, inherit)",
  color: "var(--fg, #0a0a0a)",
};

function statusChip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: `${color}1f`, color, border: `1px solid ${color}55` }}
    >
      {children}
    </span>
  );
}

export default function UnlockGate({ resource }: { resource: AccessResource }) {
  const { address } = useAppKitAccount();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    setQuoteError(false);
    if (!address) return;
    nibshareApi
      .quote(resource.id, address)
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch(() => { if (!cancelled) setQuoteError(true); });
    return () => { cancelled = true; };
  }, [resource.id, address]);

  if (quoteError) {
    return (
      <div style={gateBanner}>
        <div className="mb-4">{statusChip({ color: "#b45309", children: (<><FiAlertTriangle size={12} /> Can&apos;t check access</>) })}</div>
        <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 8 }}>Couldn&apos;t load your access status</div>
        <div style={{ fontSize: 15, color: "var(--muted, #6b6862)", lineHeight: 1.5, maxWidth: 380 }}>
          We couldn&apos;t check whether your wallet has a whitelist tier or existing access, so pricing may not be
          accurate. Try again before unlocking.
        </div>
        <button
          type="button"
          onClick={() => { setQuote(null); setQuoteError(false); }}
          className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-semibold cursor-pointer"
          style={{ marginTop: 16, border: "1px solid var(--border, #ddd)", background: "transparent", color: "var(--fg, #0a0a0a)" }}
        >
          <FiRotateCcw size={13} /> Retry
        </button>
      </div>
    );
  }

  if (quote?.banned) {
    return (
      <div style={gateBanner}>
        <div className="mb-4">{statusChip({ color: "#c44", children: (<><FiShieldOff size={12} /> Banned</>) })}</div>
        <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 8 }}>No access</div>
        <div style={{ fontSize: 15, color: "var(--muted, #6b6862)", lineHeight: 1.5, maxWidth: 380 }}>
          This wallet is banned from this content. If you think this is a mistake,
          reach out to the creator.
        </div>
      </div>
    );
  }

  if (quote && !quote.canUnlock) {
    return (
      <div style={gateBanner}>
        <div className="mb-4">{statusChip({ color: "#b45309", children: (<><FiLock size={12} /> Invite only</>) })}</div>
        <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 8 }}>Invite only</div>
        <div style={{ fontSize: 15, color: "var(--muted, #6b6862)", lineHeight: 1.5, maxWidth: 380 }}>
          {quote.reason || "This content is invite-only — only whitelisted wallets can unlock it."}
        </div>
      </div>
    );
  }

  const effectivePrice = quote?.effectivePrice ?? resource.price;
  const publicPrice = resource.price;
  const whitelisted = !!quote?.inWhitelist;
  const whitelistTier = quote?.whitelistPrice;
  const hasTier = whitelisted && !!whitelistTier && whitelistTier !== "";
  const tierDiscounted =
    hasTier && Number(effectivePrice) < Number(publicPrice) && Number(publicPrice) > 0;

  return (
    <>
      {quote?.revoked && (
        <div
          className="nibshare-error-alert"
          style={{ maxWidth: 580, margin: "0 auto 1rem", textAlign: "center", color: "#b45309", borderColor: "#b4530966" }}
        >
          <FiRotateCcw className="inline mr-1" size={12} /> Your previous access was revoked — pay again to re-unlock.
        </div>
      )}

      <NibgateUnlock
        resource={{
          id: resource.id,
          title: resource.title,
          type: resource.type,
          price: effectivePrice,
          originalPrice: tierDiscounted ? publicPrice : undefined,
          whitelistPrice: quote?.whitelistPrice ?? null,
          publicAccess: quote?.publicAccess ?? resource.publicAccess ?? true,
          currency: resource.currency,
          path: resource.path,
        }}
        accessPath={ACCESS_PATH(resource.id)}
        gatewayBalanceUrl={GATEWAY_BALANCE_PATH}
        noncePath="/auth/nonce"
        verifyPath="/auth/verify"
      >
        {(state) => (
          <ContentViewer
            body={(state.payload as { content?: unknown } | null)?.content}
            title={resource.title}
            slug={resource.id}
          />
        )}
      </NibgateUnlock>
    </>
  );
}