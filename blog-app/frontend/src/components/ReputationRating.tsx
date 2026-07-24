"use client";

import { useEffect, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  const [hubConfig, setHubConfig] = useState<{ siteId: string; token: string } | null>(null);

  useEffect(() => {
    apiFetch("/site").then((d: any) => {
      if (d?.hub?.siteId && d?.hub?.token) {
        setHubConfig({ siteId: d.hub.siteId, token: d.hub.token });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;

    import("@nibgate/sdk").then((mod) => {
      if (!containerRef.current) return;
      (mod as any).renderDefaultRatingUI(containerRef.current, resource, {
        statsUrl: `${apiUrl(`/rating/${resource.id}`)}?subdomain=${siteSubdomain()}`,
        apiBase: apiUrl(""),
        contentId: '0x' + resource.id.replace(/-/g, ''),
        indexUrl: hubConfig ? `https://api.nibgate.xyz/api/hub/reputation/ratings/index` : undefined,
        siteId: hubConfig?.siteId,
        token: hubConfig?.token,
        onRated: (result: any) => {
          apiFetch(`/rating/${resource.id}`, {
            method: "POST",
            body: JSON.stringify({
              wallet: result.walletAddress,
              rating: result.ratingValue,
              txHash: result.txHash,
            }),
          }).catch(() => {});
        },
      });
    }).catch((err) => {
      console.error("Rating module failed to load:", err);
    });
  }, [resource, hubConfig]);

  return <div ref={containerRef} />;
}
