import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AccentContext, ThemeProvider, usePal, useThemeContext } from "./halaska-kit";

type Scheme = "light" | "dark";
export type ThemePref = "system" | "light" | "dark";
const query = "(prefers-color-scheme: dark)";
const KEY = "ph-theme";

const readPref = (): ThemePref => {
  try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark") return v; } catch { /* storage unavailable */ }
  return "system";
};

const PrefCtx = createContext<{ pref: ThemePref; setPref: (p: ThemePref) => void }>({ pref: "system", setPref: () => {} });
export const useThemePref = () => useContext(PrefCtx);

function useScheme(): [Scheme, ThemePref, (p: ThemePref) => void] {
  const [system, setSystem] = useState<Scheme>(() => (window.matchMedia(query).matches ? "dark" : "light"));
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const setPref = (p: ThemePref) => { setPrefState(p); try { if (p === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* ignore */ } };
  return [pref === "system" ? system : pref, pref, setPref];
}

/** Grayscale only: the accent is black in light mode and near-white in dark mode. */
export function Providers({ children }: { children: ReactNode }) {
  const [scheme, pref, setPref] = useScheme();
  return (
    <PrefCtx.Provider value={{ pref, setPref }}>
      <ThemeProvider theme={scheme}>
        <AccentContext.Provider value={scheme === "dark" ? "#f0f0f0" : "#111111"}>
          <Page>{children}</Page>
        </AccentContext.Provider>
      </ThemeProvider>
    </PrefCtx.Provider>
  );
}

function Page({ children }: { children: ReactNode }) {
  const pal = usePal(useThemeContext());
  const theme = useThemeContext();
  useEffect(() => { document.body.style.background = pal.bg; document.body.style.color = pal.text; }, [pal.bg, pal.text]);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  return <div style={{ minHeight: "100vh", background: pal.bg, color: pal.text }}>{children}</div>;
}

export const usePalette = () => usePal(useThemeContext());
export const useTheme = () => useThemeContext() as Scheme;
