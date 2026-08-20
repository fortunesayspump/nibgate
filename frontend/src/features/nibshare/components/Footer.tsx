"use client";

import ThemeToggle from "@/components/ThemeToggle";
import { useAppKitAccount, useDisconnect, useNibgateConnect } from "@nibgate/wallet/react";

function shortAddress(a: string) {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function FooterWalletBar() {
  const { address } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  const { connect } = useNibgateConnect({ authBase: "", noncePath: "/auth/nonce", verifyPath: "/auth/verify" });
  const monospace = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };
  const linkStyle: React.CSSProperties = { cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" };

  return (
    <span className="muted font-ui" style={{ display: "inline-flex", alignItems: "center", gap: "0.5em", fontSize: 13 }}>
      {address ? (
        <>
          <span style={monospace}>{shortAddress(address)}</span>
          <button type="button" className="muted plain" style={linkStyle} onClick={() => disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <button type="button" className="muted plain" style={linkStyle} onClick={() => void connect()}>
          Connect wallet
        </button>
      )}
    </span>
  );
}

export default function NibshareFooter() {
  return (
    <footer className="bt pn2" style={{ margin: "2em auto", maxWidth: "var(--wrap-wide)", width: "var(--wrap-normal)", textAlign: "center" }}>
      <div className="theme-toggle" style={{ justifyContent: "center", marginBottom: "1.5em", gap: "1.4em", flexWrap: "wrap", rowGap: "0.6em" }}>
        <ThemeToggle />
        <FooterWalletBar />
      </div>
      <p className="muted font-ui" style={{ textAlign: "center" }}>
        <a href="https://nibgate.xyz" target="_blank" rel="noopener noreferrer" className="muted plain" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3em" }}>
          <span>Powered by</span>
          <span style={{ display: "inline-block", height: "64px", aspectRatio: "522/411", backgroundColor: "var(--fg)", maskImage: "url(/logo.svg)", maskSize: "contain", maskRepeat: "no-repeat", WebkitMaskImage: "url(/logo.svg)", WebkitMaskSize: "contain", WebkitMaskRepeat: "no-repeat" }} />
          <span style={{ display: "inline-block", height: "28px", aspectRatio: "645/187", backgroundColor: "var(--fg)", maskImage: "url(/nibgate-wordmark.svg)", maskSize: "contain", maskRepeat: "no-repeat", WebkitMaskImage: "url(/nibgate-wordmark.svg)", WebkitMaskSize: "contain", WebkitMaskRepeat: "no-repeat" }} />
        </a>
      </p>
    </footer>
  );
}