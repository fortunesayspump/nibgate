import type { Metadata } from "next";
import "./globals.css";
import { apiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: { default: "Nibgate Blog", template: "%s · Nibgate Blog" },
  description: "Product updates, creator guides, and thinking behind the reputation layer.",
};

async function getWidget() {
  try {
    const res = await fetch(apiUrl("/site"), { next: { revalidate: 3600 } });
    if (!res.ok) return "";
    const d = await res.json();
    return d.widgetScript || "";
  } catch { return ""; }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const widget = await getWidget();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`
        }} />
      </head>
      <body>{widget && <div dangerouslySetInnerHTML={{ __html: widget }} />}{children}</body>
    </html>
  );
}
