import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { AirportProvider } from "./contexts/AirportContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element not found - check index.html");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AirportProvider>
          <App />
        </AirportProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
