"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import BrandLogo from "./BrandLogo";
import BrandWordmark from "./BrandWordmark";
import { WalletButton, WalletButtonMobile } from "@/components/WalletButton";


export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const activePath = usePathname();

  const navItems = [
    { label: "Explore", href: "/explore" },
    { label: "Blog", href: "/blog" },
    { label: "Leaderboards", href: "/leaderboards" },
    { label: "Features", href: "/features" },
    { label: "About", href: "/about" },
  ];

  return (
    <>
      <header className="nibgate-site-header">
      <div className="nibgate-header-inner">
        <div className="nibgate-header-identity">
          <Link className="nibgate-header-logo" href="/" aria-label="Nibgate home">
            <BrandLogo />
            <BrandWordmark />
          </Link>
        </div>

        <div className="nibgate-header-actions">
          <nav className="nibgate-header-nav nibgate-header-nav-desktop" aria-label="Primary navigation">
            <ul className="nibgate-primary-nav">
              {navItems.map((item) => (
                <li key={item.href} className="nibgate-primary-nav-item">
                  <Link
                    href={item.href}
                    className={`nibgate-primary-nav-link ${
                      activePath === item.href ? "is-active" : ""
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <WalletButton />

          <button
            className={`nibgate-header-menu ${isMobileMenuOpen ? "is-open" : ""}`}
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Open menu"
            aria-expanded={isMobileMenuOpen}
          >
            <span data-menu-line="1"></span>
            <span data-menu-line="2"></span>
          </button>
        </div>
      </div>

      <nav
        className={`nibgate-header-mobile ${isMobileMenuOpen ? "is-visible" : ""}`}
        id="mobile-menu"
        aria-label="Mobile navigation"
      >
        <ul className="nibgate-primary-nav">
          {navItems.map((item) => (
            <li key={item.href} className="nibgate-primary-nav-item">
              <Link
                href={item.href}
                className={`nibgate-primary-nav-link ${
                  activePath === item.href ? "is-active" : ""
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <WalletButtonMobile />
      </nav>
    </header>
    <div style={{ height: "80px", width: "100%", flex: "0 0 auto" }} aria-hidden="true" />
    </>
  );
}
