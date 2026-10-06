import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { Providers } from "./theme";
import { ToastProvider } from "./ui";

createRoot(document.getElementById("root")!).render(
  <StrictMode><Providers><ToastProvider><App /></ToastProvider></Providers></StrictMode>,
);
