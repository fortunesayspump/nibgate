import type { Metadata } from "next";
import "./globals.css";
import { serverFetch } from "@/lib/server-fetch";
import Footer from "@/components/Footer";

async function getSite(): Promise<Record<string, any> | null> {
  try {
    return await serverFetch("/site", { cache: "no-store" });
  } catch { return null; }
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await getSite();
  const name = data?.site?.name || "Nibgate Blog";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.NEXT_PUBLIC_VERCEL_URL && `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`)
    || "http://localhost:3001";
  return {
    title: { default: name, template: `%s · ${name}` },
    description: data?.site?.description || `${name} — a blog on nibgate.xyz. Write, publish, and earn USDC from your content.`,
    metadataBase: new URL(siteUrl),
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    openGraph: {
      title: name,
      description: data?.site?.description || `${name} — a blog on nibgate.xyz.`,
      url: siteUrl,
      siteName: name,
      type: "website",
      images: [{ url: "https://nibgate.xyz/og-image", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description: data?.site?.description || `${name} — a blog on nibgate.xyz.`,
      images: ["https://nibgate.xyz/og-image"],
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const data = await getSite();
  const widget = data?.widgetScript || "";
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Kumbh+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/nibgate-mark.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/nibgate-mark.svg" />
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`
        }} />
      </head>
      <body>{widget && <div dangerouslySetInnerHTML={{ __html: widget }} />}{children}<Footer /></body>
    </html>
  );
}
