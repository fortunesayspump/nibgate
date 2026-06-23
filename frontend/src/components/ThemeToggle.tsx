"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Initialize state from HTML attribute set by the blocking inline script
    const currentTheme = document.documentElement.dataset.theme as "light" | "dark";
    if (currentTheme) {
      setTheme(currentTheme);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.body.dataset.theme = nextTheme;
    localStorage.setItem("nibgate-theme", nextTheme);
  };

  const isLight = theme === "light";

  return (
    <div className="theme-toggle">
      <span className="theme-toggle__label tag-label">Dark</span>
      <button
        id="nibgate-theme"
        className="theme-toggle__button"
        type="button"
        aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
        aria-pressed={isLight}
        onClick={toggleTheme}
      ></button>
      <span className="theme-toggle__label tag-label">Light</span>
    </div>
  );
}
