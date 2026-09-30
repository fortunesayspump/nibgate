"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Microscope } from "lucide-react";

export default function DrNibFab() {
  const pathname = usePathname();
  if (pathname === "/dr-nib" || pathname?.startsWith("/dr-nib/")) {
    return null;
  }

  return (
    <Link
      href="/dr-nib"
      aria-label="Open Dr. Nib research workspace"
      title="Dr. Nib"
      data-testid="dr-nib-fab"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 90,
        width: 60,
        height: 60,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        color: "#fff",
        textDecoration: "none",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
      }}
    >
      <Microscope size={26} aria-hidden="true" strokeWidth={1.8} />
    </Link>
  );
}
