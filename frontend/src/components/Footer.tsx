import Link from "next/link";
import NewsletterForm from "./NewsletterForm";
import ThemeToggle from "./ThemeToggle";

const footerMenus = [
  {
    id: "project-menu",
    title: "Project",
    links: [
      ["Why Nibgate?", "/about"],
      ["Get started", "/get-started"],
      ["Payments", "/payments"],
      ["Discovery", "/discovery"],
      ["Security", "/security"],
      ["Widget", "/widget.js"],
      ["Status", "/api/nibgate/status"],
    ],
  },
  {
    id: "explore-menu",
    title: "Explore",
    links: [
      ["Explore hub", "/explore"],
      ["Articles", "/explore?type=article"],
      ["Images", "/explore?type=image"],
      ["Music", "/explore?type=music"],
      ["Video", "/explore?type=video"],
      ["Leaderboards", "/leaderboards"],
      ["Creator rankings", "/leaderboards?type=creators"],
      ["Best sellers", "/explore?sort=best-sellers"],
      ["Hot & new", "/explore?sort=hot-new"],
      ["Agent discovery", "/explore?category=agent-routes"],
    ],
  },
  {
    id: "developers-menu",
    title: "Developers",
    links: [
      ["Documentation", "https://docs.nibgate.xyz"],
      ["Quick start", "https://docs.nibgate.xyz/quick-start"],
      ["GitHub", "https://github.com/fortunesayspump/nibgate"],
      ["Install package", "https://docs.nibgate.xyz/install-package"],
      ["Hub widget", "https://docs.nibgate.xyz/widget"],
      ["Status API", "/api/nibgate/status"],
    ],
  },
  {
    id: "community-menu",
    title: "Community",
    links: [
      ["Blog", "/blog"],
      ["Newsletter", "#newsletter"],
      ["GitHub discussions", "https://github.com/fortunesayspump/nibgate"],
      ["Contribute", "https://github.com/fortunesayspump/nibgate"],
      ["Creator rankings", "/leaderboards?type=creators"],
      ["Examples", "https://docs.nibgate.xyz/examples"],
      ["Roadmap", "https://docs.nibgate.xyz/roadmap"],
      ["Sponsor", "https://github.com/fortunesayspump/nibgate"],
    ],
  },
  {
    id: "support-menu",
    title: "Support",
    links: [
      ["Get help", "mailto:hello@nibgate.xyz"],
      ["Creator guide", "/get-started"],
      ["Developer support", "mailto:hello@nibgate.xyz"],
      ["FAQs", "/faq"],
      ["Cookie policy", "/cookies"],
      ["Privacy policy", "/privacy"],
      ["Terms", "/terms"],
      ["Contact", "mailto:hello@nibgate.xyz"],
    ],
  },
];

export default function Footer({ showThemeToggle = false }: { showThemeToggle?: boolean }) {
  return (
    <footer className="app__footer footer">
      <nav className="footer-menu" aria-label="Footer menu">
        <div className="footer-menu__grid grid">
          {footerMenus.map((menu) => (
            <div key={menu.id} className="footer-menu__column" data-footer-menu-column>
              <div className="footer-menu__column-header">
                <p className="footer-menu__column-heading">{menu.title}</p>
              </div>
              <ul className="footer-menu__list" id={menu.id} data-footer-menu-list>
                {menu.links.map(([label, href]) => {
                  const isExternal = href.startsWith("http") || href.startsWith("mailto:");
                  return (
                    <li key={label} className="footer-menu__item">
                      {isExternal ? (
                        <a
                          className="footer-menu__link"
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {label}
                        </a>
                      ) : (
                        <Link className="footer-menu__link" href={href}>
                          {label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="footer__base">
        <div className="grid">
          <ul className="footer__links-wrap">
            <li className="footer__link-item">
              <Link className="footer__icon-link footer__icon-link--sponsor" href="/get-started">
                <svg className="footer__icon" aria-hidden="true"><use xlinkHref="#money"></use></svg>
                <div className="footer__icon-link-content">
                  <h2 className="footer__icon-link-heading">Connect your site</h2>
                  <p className="mini-meta">
                    Install the package, protect a route, and connect wallet-native paid content from
                    your own site.
                  </p>
                </div>
              </Link>
            </li>
            <li className="footer__link-item">
              <a
                className="footer__icon-link footer__icon-link--contribute"
                href="https://github.com/fortunesayspump/nibgate"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg className="footer__icon" aria-hidden="true"><use xlinkHref="#code-file"></use></svg>
                <div className="footer__icon-link-content">
                  <h2 className="footer__icon-link-heading">Contribute code</h2>
                  <p className="mini-meta">Help shape the CLI, widget, and discovery layer.</p>
                </div>
              </a>
            </li>
          </ul>

          <div className="footer__sign-up">
            <div className="footer__sub-footer">
              <div className="footer__socials">
                <p className="footer__social-heading heading-four">Follow us</p>
                <ul className="footer__social-list">
                  <li>
                    <a href="https://x.com/nibgate" target="_blank" rel="noopener noreferrer" aria-label="Follow Nibgate on X">
                      <svg className="footer__social-icon" aria-hidden="true"><use xlinkHref="#twitter"></use></svg>
                    </a>
                  </li>
                  <li>
                    <a href="https://github.com/fortunesayspump/nibgate" target="_blank" rel="noopener noreferrer" aria-label="Follow Nibgate on GitHub">
                      <svg className="footer__social-icon footer__social-icon--github" aria-hidden="true"><use xlinkHref="#github"></use></svg>
                    </a>
                  </li>
                  <li>
                    <a href="mailto:hello@nibgate.xyz" aria-label="Email Nibgate">
                      <svg className="footer__social-icon" aria-hidden="true"><use xlinkHref="#envelope"></use></svg>
                    </a>
                  </li>
                </ul>
              </div>

              {showThemeToggle && <ThemeToggle />}
            </div>

            <div className="sign-up-form sign-up-form--footer" id="newsletter">
              <div className="sign-up-form__inner">
                <h2 className="sign-up-form__heading heading-three">This Week in Nibgate</h2>
                <p className="sign-up-form__sub-heading">
                  Sign up for product notes, creator examples, and launch updates.
                </p>
                <NewsletterForm />
              </div>
            </div>
          </div>

          <p className="footer__credit">
            Nibgate is an independent project for creator-owned paid routes.{" "}
            <a
              className="footer__link"
              href="https://github.com/fortunesayspump/nibgate"
              target="_blank"
              rel="noopener noreferrer"
            >
              View the repo
            </a>
            . &copy; 2026
          </p>
        </div>
      </div>
    </footer>
  );
}
