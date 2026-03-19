import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { AirportProvider } from "./contexts/AirportContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
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
