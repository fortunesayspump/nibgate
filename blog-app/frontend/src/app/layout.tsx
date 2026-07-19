import type { Metadata } from "next";
import "./globals.css";
import { apiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: {
    default: "Nibgate Blog",
    template: "%s · Nibgate Blog",
  },
  description: "Product updates, creator guides, and thinking behind the reputation layer.",
};

async function getWidgetScript() {
  try {
    const res = await fetch(apiUrl("/site"), { next: { revalidate: 3600 } });
    if (!res.ok) return "";
    const data = await res.json();
    return data.widgetScript || "";
  } catch {
    return "";
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const widget = await getWidgetScript();

  return (
    <html lang="en">
      <body className="bg-[var(--bg)] text-[var(--fg)] antialiased">
        {widget && <div dangerouslySetInnerHTML={{ __html: widget }} />}
        <div className="mx-auto flex min-h-screen w-full max-w-[648px] flex-col px-6 pt-14 md:pt-16">
          {children}
        </div>
      </body>
    </html>
  );
}
