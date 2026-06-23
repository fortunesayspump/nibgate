"use client";

import Link from "next/link";

export default function Hero() {
  return (
    <section className="nibgate-hero-shell">
      <div className="nibgate-hero-grid">
        <header className="nibgate-hero hero--home">
          <div className="nibgate-hero-inner">
            <hgroup>
              <h1 className="nibgate-hero-heading">
                Create content worth<br />unlocking
              </h1>
              <p className="nibgate-hero-subheading">Wallet-native paid content, on your site.</p>
            </hgroup>

            <div className="nibgate-hero-intro">
              <p>
                It is simple, creator-owned, and built for x402 payments on Arc testnet, so people and
                agents can unlock protected routes from your own website.
              </p>
            </div>
          </div>

          <div className="nibgate-hero-icon" aria-hidden="true">
            <span className="nibgate-hero-flower-outline"></span>
            <span className="nibgate-hero-flower"></span>
          </div>
        </header>
      </div>

      <div className="nibgate-hero-grid">
        <div className="code-snippet" data-code-snippet>
          <pre data-code-to-copy>
            <p>npm install nibgate</p>
          </pre>
          <button
            className="code-snippet__button"
            type="button"
            aria-label="Copy the command npm install nibgate"
            onClick={(e) => {
              navigator.clipboard.writeText("npm install nibgate");
              const target = e.currentTarget.parentElement;
              target?.classList.add("has-copied");
              setTimeout(() => target?.classList.remove("has-copied"), 1200);
            }}
          >
            <svg className="code-snippet__icon" aria-hidden="true">
              <use xlinkHref="#copy"></use>
            </svg>
          </button>
          <p className="code-snippet__confirmation" role="alert">
            Copied!
          </p>
        </div>
      </div>

      <div className="nibgate-hero-grid">
        <div className="nibgate-button-align nibgate-button-align-home">
          <Link href="/get-started" className="nibgate-hero-button nibgate-hero-button-primary nibgate-button-align-item">
            <p className="nibgate-button-text">Publish</p>
            <svg className="nibgate-button-arrow" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8.7 1.3 15.4 8l-6.7 6.7-1.4-1.4L11.6 9H.5V7h11.1L7.3 2.7l1.4-1.4Z"></path>
            </svg>
          </Link>

          <Link href="/explore" className="nibgate-hero-button nibgate-hero-button-secondary nibgate-button-align-item">
            <p className="nibgate-button-text">Explore</p>
            <svg className="nibgate-button-arrow" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8.7 1.3 15.4 8l-6.7 6.7-1.4-1.4L11.6 9H.5V7h11.1L7.3 2.7l1.4-1.4Z"></path>
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
