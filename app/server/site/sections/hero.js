export function heroSection() {
  return `<section class="nibgate-hero-shell">
    <div class="nibgate-hero-grid">
      <header class="nibgate-hero hero--home">
        <div class="nibgate-hero-inner">
          <hgroup>
            <h1 class="nibgate-hero-heading">Create content worth<br>unlocking</h1>
          <p class="nibgate-hero-subheading">Wallet-native paid content, on your site.</p>
          </hgroup>

          <div class="nibgate-hero-intro">
            <p>It is simple, creator-owned, and built for x402 payments on Arc testnet, so people and agents can unlock protected routes from your own website.</p>
          </div>
        </div>

        <div class="nibgate-hero-icon" aria-hidden="true">
          <span class="nibgate-hero-flower-outline"></span>
          <span class="nibgate-hero-flower"></span>
        </div>
      </header>
    </div>

    <div class="nibgate-hero-grid">
      <div class="code-snippet" data-code-snippet>
        <pre data-code-to-copy><p>npm install nibgate</p></pre>
        <button class="code-snippet__button" type="button" aria-label="Copy the command \`npm install nibgate\`" data-copy-code-button>
          <svg class="code-snippet__icon" aria-hidden="true">
            <use xlink:href="#copy"></use>
          </svg>
        </button>
        <p class="code-snippet__confirmation" role="alert">Copied!</p>
      </div>
    </div>

    <div class="nibgate-hero-grid">
      <div class="nibgate-button-align nibgate-button-align-home">
        <a href="/get-started" class="nibgate-hero-button nibgate-hero-button-primary nibgate-button-align-item">
          <p class="nibgate-button-text">Start publishing</p>
          <svg class="nibgate-button-arrow" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8.7 1.3 15.4 8l-6.7 6.7-1.4-1.4L11.6 9H.5V7h11.1L7.3 2.7l1.4-1.4Z"></path>
          </svg>
        </a>

        <a href="/explore" class="nibgate-hero-button nibgate-hero-button-secondary nibgate-button-align-item">
          <p class="nibgate-button-text">Explore</p>
          <svg class="nibgate-button-arrow" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8.7 1.3 15.4 8l-6.7 6.7-1.4-1.4L11.6 9H.5V7h11.1L7.3 2.7l1.4-1.4Z"></path>
          </svg>
        </a>
      </div>
    </div>
  </section>`;
}
