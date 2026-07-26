"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;

    let hubSiteId = "";
    let hubToken = "";

    apiFetch("/site").then((d: any) => {
      if (d?.hub?.siteId && d?.hub?.token) {
        hubSiteId = d.hub.siteId;
        hubToken = d.hub.token;
      }
    }).catch(() => {}).finally(() => {
      if (!containerRef.current) return;
      import("@nibgate/sdk").then((mod) => {
        if (!containerRef.current) return;
        (mod as any).renderDefaultRatingUI(containerRef.current, resource, {
          statsUrl: `${apiUrl(`/rating/${resource.id}`)}?subdomain=${siteSubdomain()}`,
          apiBase: apiUrl(""),
          contentId: '0x' + resource.id.replace(/-/g, ''),
          indexUrl: hubSiteId ? `https://api.nibgate.xyz/api/hub/reputation/ratings/index` : undefined,
          siteId: hubSiteId || undefined,
          token: hubToken || undefined,
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
    });
  }, [resource]);

  return <div ref={containerRef} />;
}
