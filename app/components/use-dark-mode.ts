import { useEffect, useState } from "react";

/** The key root.tsx reads before hydration to paint the saved theme. */
const THEME_KEY = "cadence-theme";

/** Whether the page is dark, and a toggle that flips it and remembers the choice. */
export function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDarkMode() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    rememberThemeIfStorageAllows(next ? "dark" : "light");
  }

  return { isDark, toggleDarkMode };
}

function rememberThemeIfStorageAllows(theme: "dark" | "light") {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}
