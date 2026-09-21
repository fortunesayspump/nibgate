"use client";

// Shown only on testnet builds (NEXT_PUBLIC_NIBGATE_NETWORK=testnet).
// A persistent top strip so nobody mistakes play money for real money.
// Renders nothing on mainnet — same code ships to both stacks.
const IS_TESTNET =
  (process.env.NEXT_PUBLIC_NIBGATE_NETWORK || "testnet").toLowerCase() !== "mainnet";

export default function TestnetBanner() {
  if (!IS_TESTNET) return null;
  let mainnetHref = "https://nibgate.xyz";
  try {
    const host = window.location.hostname;
    if (host.endsWith(".testnet.nibgate.xyz")) {
      mainnetHref = `https://${host.replace(/\.testnet\.nibgate\.xyz$/, ".nibgate.xyz")}`;
    }
  } catch {}
  return (
    <div
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
      <a href={mainnetHref} style={{ textDecoration: "underline", color: "#1a1a1a" }}>
        Go to mainnet
      </a>
    </div>
  );
}
