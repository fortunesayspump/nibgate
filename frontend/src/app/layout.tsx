import type { Metadata } from "next";
import { Suspense } from "react";
import SvgSprite from "@/components/SvgSprite";
import NavigationProgress from "@/components/NavigationProgress";
import ThemeBootstrap from "@/components/ThemeBootstrap";
import { Providers } from "./providers";
import "../styles/styles.css";

export const metadata: Metadata = {
  title: "Nibgate - verified content discovery",
  description:
    "Nibgate helps creators publish wallet-unlocked content from their own websites, verify source ownership, and make quality content discoverable to humans and AI agents.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className="group/body" data-default-theme="light">
        <ThemeBootstrap />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <SvgSprite />
        <div id="design-settings" style={{ display: "none" }}></div>
        <Providers>
          <div className="flex flex-col lg:flex-row min-h-screen">
            <main className="flex-1 flex flex-col">
              <div className="flex-1 flex flex-col">
                <div className="nibgate-site-surface block bg-white text-black text-base font-normal leading-relaxed tracking-tight">
                  {children}
                </div>
              </div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
