import type { Metadata } from "next";
import Script from "next/script";
import SvgSprite from "@/components/SvgSprite";
import "../styles/styles.css";

export const metadata: Metadata = {
  title: "Nibgate - wallet-native paid content",
  description:
    "Nibgate helps creators publish wallet-unlocked content from their own websites and surface paid routes in public discovery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const savedTheme = localStorage.getItem('nibgate-theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const theme = savedTheme === 'light' || savedTheme === 'dark'
                  ? savedTheme
                  : (prefersDark ? 'dark' : 'light');
                document.documentElement.dataset.theme = theme;
              } catch {}
            `,
          }}
        />
      </head>
      <body className="group/body" data-default-theme="light">
        <SvgSprite />
        <div id="design-settings" style={{ display: "none" }}></div>
        <div className="flex flex-col lg:flex-row min-h-screen">
          <main className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col">
              <div className="nibgate-site-surface block bg-white text-black text-base font-normal leading-relaxed tracking-tight">
                {children}
              </div>
            </div>
          </main>
        </div>
        <Script src="/wallet-connect.js" strategy="lazyOnload" type="module" />
      </body>
    </html>
  );
}
