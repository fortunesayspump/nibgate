import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nibgate Docs",
  description: "Documentation for Nibgate package, widget, site verification, content events, analytics, payments, and APIs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
