export default function Footer() {
  return (
    <footer className="bt pn2" style={{ margin: "2em auto", maxWidth: "var(--wrap-wide)", width: "var(--wrap-normal)", textAlign: "center" }}>
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
