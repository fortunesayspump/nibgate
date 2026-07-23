"use client";

import { useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api";

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

    import("@nibgate/sdk").then((mod) => {
      if (!containerRef.current) return;
      mod.renderDefaultRatingUI(containerRef.current, resource, {
        statsUrl: apiUrl(`/rating/${resource.id}`),
        apiBase: apiUrl(""),
        contentId: '0x' + resource.id.replace(/-/g, ''),
        onRated: (result: any) => {
          fetch(apiUrl(`/rating/${resource.id}`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
  }, [resource]);

  return <div ref={containerRef} />;
}
