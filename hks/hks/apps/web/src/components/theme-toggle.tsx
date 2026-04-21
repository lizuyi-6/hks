"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-theme") as "light" | "dark" | null) ??
      (localStorage.getItem("theme") as "light" | "dark" | null);
    const resolved: "light" | "dark" = current === "dark" ? "dark" : "light";
    setTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <button
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-neutral-100 hover:text-text-primary"
      aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
      title={theme === "light" ? "切换深色模式" : "切换浅色模式"}
    >
      {theme === "light" ? (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 1v1M8 14v1M1 8h1M14 8h1M3.1 3.1l.7.7M12.2 12.2l.7.7M12.2 3.8l-.7.7M3.8 12.2l-.7.7M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 9a5 5 0 1 1-6-6 4 4 0 0 0 6 6z" />
        </svg>
      )}
    </button>
  );
}
