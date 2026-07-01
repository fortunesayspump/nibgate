import type { Metadata } from "next";
import { getPageMap } from "nextra/page-map";
import { Layout, Navbar, Footer } from "nextra-theme-docs";
import { Suspense } from "react";
import NavigationProgress from "./navigation-progress";
import "nextra-theme-docs/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nibgate Docs",
  description: "Documentation for Nibgate package, widget, site verification, content events, analytics, payments, and APIs.",
  icons: {
    icon: "/brand/nibgate-mark.svg",
    shortcut: "/brand/nibgate-mark.svg",
    apple: "/brand/nibgate-mark.svg",
  },
};

const navbar = (
  <Navbar
    logo={
      <span className="nib-docs-logo">
        <img src="/brand/nibgate-wordmark.svg" alt="Nibgate" />
        <span>Docs</span>
      </span>
    }
    projectLink="https://github.com/fortunesayspump/nibgate"
  />
);

const footer = (
  <Footer>
    <div className="nib-docs-footer">
      <span>Nibgate docs. Built for creator-owned paid routes.</span>
      <nav aria-label="Nibgate links">
        <a href="https://nibgate.xyz">Main site</a>
        <a href="https://nibgate.xyz/explore">Explore</a>
        <a href="https://nibgate.xyz/get-started">Get started</a>
        <a href="https://github.com/fortunesayspump/nibgate">GitHub</a>
      </nav>
    </div>
  </Footer>
);

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/fortunesayspump/nibgate/tree/main/docs"
          editLink="Edit this page"
          feedback={{ content: "Give feedback", link: "https://github.com/fortunesayspump/nibgate/issues" }}
          darkMode={false}
          nextThemes={{ forcedTheme: "light" }}
          sidebar={{ defaultOpen: true, toggleButton: true }}
          toc={{ title: "On this page" }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
