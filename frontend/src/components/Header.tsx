"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const activePath = usePathname();

  const navItems = [
    { label: "Explore", href: "/explore" },
    { label: "Blog", href: "/blog" },
    { label: "Features", href: "/features" },
    { label: "About", href: "/about" },
  ];

  return (
    <>
      <header className="nibgate-site-header">
      <div className="nibgate-header-inner">
        <div className="nibgate-header-identity">
          <Link className="nibgate-header-logo" href="/" aria-label="Nibgate home">
            <span>nibgate</span>
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

          {/* Web3 Connect (Placeholder for Wagmi/SIWE) */}
          <div className="nibgate-wallet-container" data-balance-container>
            <button type="button" className="nibgate-header-login" data-balance-text>0.00 USDC</button>
            <div className="hidden-dropdown" data-balance-dropdown style={{ display: "none" }}></div>
          </div>
          
          <div className="nibgate-wallet-container" data-wallet-container>
            <button className="nibgate-header-cta" type="button" data-wallet-connect>Connect wallet</button>
            <div className="nibgate-wallet-dropdown" data-wallet-dropdown style={{ display: "none" }}>
              <Link href="/dashboard" className="dropdown-item">Dashboard</Link>
              <button type="button" className="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
            </div>
          </div>

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
        <div className="nibgate-wallet-container" data-balance-container style={{ width: "100%" }}>
          <button type="button" className="nibgate-header-mobile-login" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }} data-balance-text>0.00 USDC</button>
          <div className="hidden-dropdown mobile-dropdown" data-balance-dropdown style={{ display: "none" }}></div>
        </div>
        
        <div className="nibgate-wallet-container" data-wallet-container style={{ width: "100%" }}>
          <button className="nibgate-header-mobile-cta" style={{ width: "100%" }} type="button" data-wallet-connect>Connect wallet</button>
          <div className="nibgate-wallet-dropdown mobile-dropdown" data-wallet-dropdown style={{ display: "none" }}>
            <Link href="/dashboard" className="dropdown-item">Dashboard</Link>
            <button type="button" className="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
          </div>
        </div>
      </nav>
    </header>
    <div style={{ height: "80px", width: "100%", flex: "0 0 auto" }} aria-hidden="true" />
    </>
  );
}
