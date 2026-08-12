"use client";

import { useEffect, useState } from "react";
import { NibgateRatingUI } from "@nibgate/wallet/react";
import { apiFetch, apiUrl } from "@/lib/api";

function siteSubdomain() {
  const parts = window.location.hostname.split(".");
  if (parts.length >= 3 && parts[0] !== "www") return parts[0];
  return "";
}

type RatingResource = {
  id: string;
  title: string;
  type: string;
  price: string;
  path: string;
};

export default function ReputationRating({ resource }: { resource: RatingResource }) {
  const [hub, setHub] = useState<{ siteId?: string; token?: string }>({});
  const [subdomain, setSubdomain] = useState("");

  useEffect(() => {
    setSubdomain(siteSubdomain());
    apiFetch("/site")
      .then((d: any) => {
        if (d?.hub?.siteId && d?.hub?.token) {
          setHub({ siteId: d.hub.siteId, token: d.hub.token });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <NibgateRatingUI
      resource={resource}
      statsUrl={`${apiUrl(`/rating/${resource.id}`)}?subdomain=${subdomain}`}
      apiBase={apiUrl("")}
      contentId={"0x" + resource.id.replace(/-/g, "")}
      indexUrl={hub.siteId ? `https://api.nibgate.xyz/hub/reputation/ratings/index` : undefined}
      siteId={hub.siteId || undefined}
      token={hub.token || undefined}
      onRated={(result: any) => {
        apiFetch(`/rating/${resource.id}`, {
          method: "POST",
          body: JSON.stringify({
            wallet: result.walletAddress,
            rating: result.ratingValue,
            txHash: result.txHash,
          }),
        }).catch(() => {});
      }}
    />
  );
}
