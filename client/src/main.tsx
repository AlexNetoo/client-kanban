import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { runIntro } from "./intro";
runIntro();
import { App } from "./App";
import { Providers } from "./theme";
import { ToastProvider } from "./ui";
import { CurrencyProvider } from "./currency";
import { ErrorBoundary } from "./ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode><Providers><ErrorBoundary><ToastProvider><CurrencyProvider><App /></CurrencyProvider></ToastProvider></ErrorBoundary></Providers></StrictMode>,
);
