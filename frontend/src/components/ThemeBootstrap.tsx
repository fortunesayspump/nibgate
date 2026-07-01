"use client";

import { useEffect } from "react";

export default function ThemeBootstrap() {
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("nibgate-theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : prefersDark ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
    } catch {}
  }, []);

  return null;
}
