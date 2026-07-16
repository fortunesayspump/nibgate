import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nibgate Blog",
    template: "%s · Nibgate Blog",
  },
  description: "Product updates, creator guides, and thinking behind the reputation layer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[var(--bg)] text-[var(--fg)] antialiased">
        <div className="mx-auto flex min-h-screen w-full max-w-[648px] flex-col px-6 pt-14 md:pt-16">
          {children}
        </div>
      </body>
    </html>
  );
}
