"use client";

import { NibgateTipCard, NibgateTipInline } from "@nibgate/wallet/react";

type TipResource = {
  id: string;
  title: string;
  type: string;
  price: string;
  path: string;
  // Absolute canonical post URL. The hub attributes tips (and derives the
  // site domain) by URL, so a bare relative path leaves the ledger row
  // unattributed. Falls back to origin + path when omitted.
  url?: string;
  imageUrl?: string;
  websiteId?: string;
};

// Hub API for tip recording. Override per deployment:
// NEXT_PUBLIC_HUB_API_URL=https://api.nibgate.xyz (mainnet).
const HUB_API_BASE =
  (process.env.NEXT_PUBLIC_HUB_API_URL || 'https://testnet-api.nibgate.xyz').replace(/\/+$/, '');

// Full tip card wired to the site's recipient wallet (provided by the server).
export default function NibgateTip({ resource, recipient = "" }: { resource: TipResource; recipient?: string }) {
  return (
    <div>
      <NibgateTipCard resource={resource} recipient={recipient || undefined} apiBase={HUB_API_BASE} />
      {!recipient ? (
        <p className="small muted" style={{ marginTop: "0.5em", textAlign: "center" }}>
          The creator hasn&apos;t set a payout wallet yet — tipping unlocks in admin settings.
        </p>
      ) : null}
    </div>
  );
}

// Compact inline variant for lists and embeds.
export function NibgateTipRow({ resource, recipient = "" }: { resource: TipResource; recipient?: string }) {
  if (!recipient) return null;
  return <NibgateTipInline resource={resource} recipient={recipient} apiBase={HUB_API_BASE} />;
}
