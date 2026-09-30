"use client";

import { useEffect, useRef } from "react";

// Shown only on testnet builds (NEXT_PUBLIC_NIBGATE_NETWORK=testnet).
// A persistent top strip so nobody mistakes play money for real money.
// Renders nothing on mainnet — same code ships to both stacks.
//
// Measures itself and exposes --testnet-banner-h so workspace layouts
// (fixed rail + viewport-height content) can subtract it. Without this,
// banner + 80px header + (100vh - 80px) content overflows by exactly the
// banner height, producing a phantom outer scrollbar.
const IS_TESTNET =
  (process.env.NEXT_PUBLIC_NIBGATE_NETWORK || "testnet").toLowerCase() !== "mainnet";

export default function TestnetBanner() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => {
      document.documentElement.style.setProperty("--testnet-banner-h", `${el.offsetHeight}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--testnet-banner-h", "0px");
    };
  }, []);

  if (!IS_TESTNET) return null;
  return (
    <>
      {/* SSR default so workspace layouts reserve the right height before the
          effect measures the real value (avoids a one-frame overflow flash). */}
      <style dangerouslySetInnerHTML={{ __html: ":root { --testnet-banner-h: 30px; }" }} />
      <div
        ref={ref}
        data-testnet-banner
      style={{
        background: "#f5b301",
        color: "#1a1a1a",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "6px 12px",
        lineHeight: 1.5,
      }}
    >
      Testnet — play money only, nothing here is real.{" "}
      <a
        href="https://nibgate.xyz"
        style={{ textDecoration: "underline", color: "#1a1a1a" }}
      >
        Go to mainnet
      </a>
      </div>
    </>
  );
}
