import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./globals.css";
import { ThemeProvider } from "@/shared/theme";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Career Copilot root element #root was not found.");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
