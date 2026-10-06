import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AccentContext, ThemeProvider, usePal, useThemeContext } from "./halaska-kit";

type Scheme = "light" | "dark";
const query = "(prefers-color-scheme: dark)";

function useScheme(): Scheme {
  const [scheme, setScheme] = useState<Scheme>(() => (window.matchMedia(query).matches ? "dark" : "light"));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setScheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return scheme;
}

/** Grayscale only: the accent is black in light mode and near-white in dark mode. */
export function Providers({ children }: { children: ReactNode }) {
  const scheme = useScheme();
  return (
    <ThemeProvider theme={scheme}>
      <AccentContext.Provider value={scheme === "dark" ? "#f0f0f0" : "#111111"}>
        <Page>{children}</Page>
      </AccentContext.Provider>
    </ThemeProvider>
  );
}

function Page({ children }: { children: ReactNode }) {
  const pal = usePal(useThemeContext());
  useEffect(() => { document.body.style.background = pal.bg; document.body.style.color = pal.text; }, [pal.bg, pal.text]);
  return <div style={{ minHeight: "100vh", background: pal.bg, color: pal.text }}>{children}</div>;
}

export const usePalette = () => usePal(useThemeContext());
export const useTheme = () => useThemeContext() as Scheme;
